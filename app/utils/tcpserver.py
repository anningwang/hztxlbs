# -*- coding:utf-8 -*-
__author__ = 'WangXiuGuo'
__version__ = '0.1'

try:
    import socketserver    # Python 3
except ImportError:
    import SocketServer    # Python 2
import threading
import time
import struct
import random
import sys

from wmmtools import WmmTools

BUF_SIZE = 4096         # 从socket每次读取的数据长度
START_CHAR = 0xA5       # 协议开始字符
END_CHAR = 0xA5         # 协议终结字符

DEVICE_BEGIN = 8        # 设备ID开始地址
DATA_BEGIN = 23         # 数据区开始地址
MSG_HEAD_LENGTH = 5     # 报文头长度，从cmd到cp  cmd(1) tp(2) cp(2)

TIMER_INTERVAL = 1


class WmmTCPServer(SocketServer.ThreadingTCPServer):

    clients = []            # clients ( socket ) list
    device_client = {}      # map device id to client ( King Pigeon protocol )

    def add_client(self, client):
        self.clients.append(client)

    def del_client(self, client):
        try:
            self.clients.remove(client)
        except ValueError:
            pass

    def add_device_client(self, device_id, client):
        self.device_client[device_id] = client

    def del_device_client(self, device_id):
        if device_id in self.device_client:
            del self.device_client[device_id]


class WmmTCPHandler(SocketServer.BaseRequestHandler):
    """
    The request handler class for our server.

    It is instantiated once per connection to the server, and must
    override the handle() method to implement communication to the
    client.
    """

    def __init__(self, request, client_address, server):
        SocketServer.BaseRequestHandler.__init__(self, request, client_address, server)
        self.protocol = None

    def setup(self):
        # self.request is the TCP socket connected to the client

        print(self.request, self.client_address)
        self.protocol = PigeonProtocol(self)
        self.protocol.start_timer()
        self.server.add_client(self.request)

    def handle(self):
        end_handle = False
        while True:
            cnt = 0
            data = ''

            while True:
                d = self.request.recv(BUF_SIZE).strip()
                data += d
                if not d:   # 远端断开连接
                    end_handle = True
                    break
                if cnt == 0:
                    start, = struct.unpack("B", d[0:1])
                    if start != START_CHAR:     # not king pigeon protocol
                        break
                end, = struct.unpack("B", d[-1])
                if end == END_CHAR:
                    break
                cnt += 1
            if end_handle:
                break

            flag_quit = self.protocol.data_received(data)
            if flag_quit is True:
                break

            cur_thread = threading.current_thread()
            name = cur_thread.name
            print 'thread:{} receive data from {}, {}'.format(name, self.client_address[0], self.client_address[1])
            time.sleep(0.1)

    def finish(self):
        print 'finish', self
        self.protocol.close_timer()
        self.protocol.del_device_protocol()
        self.server.del_client(self.request)
        return


class PigeonProtocol(object):
    """
    King Pigeon Protocol implementation
    """
    def __init__(self, handle):
        self.handle = handle
        self.host = handle.client_address[0]
        self.port = handle.client_address[1]
        self.start = 0xA5
        self.length = 5
        self.cmd = None
        self.tp = 1
        self.cp = 1
        self.device_id = None
        self.data = None
        self.sum = None
        self.end = self.start
        self.ori_rx = None
        self.hex_rx = None
        self.ori_tx = None
        self.hex_tx = None
        self.timer = None
        self.time_out_val = 180
        self.time_out_cnt = 0
        self.time_out_tick = 0
        self.tick = 0
        self.random = None
        self.upload_data = None
        self.dispatch = {
            0x70: self.process_alarm,
            0x71: self.upload_data,
            0x80: self.ack_random_number,
            0x81: self.ack_set_ip_address,
            0x82: self.ack_inquiry_ip_address,
            0x83: self.ack_set_phone_number,
            0x84: self.ack_inquiry_phone_number,
            0x8F: self.ack_arm_disarm,
            0x94: self.ack_inquiry_device_id,
            0x97: self.ack_inquiry_current_data,
            0x99: self.ack_control_relay
        }
        self.timer_func = [
            # --- counter, period, function ---
            [30, 60, self.ontimer_keep_alive]
        ]

    def __del__(self):
        self.close_timer()

    def get_device_id(self):
        return self.device_id

    def data_received(self, data):
        d = self.escape_string_receive(data)
        self.ori_rx = d
        self.hex_rx = d.encode('hex').upper()
        self.time_out_tick = 0
        self.time_out_cnt = 0

        # 测试代码
        # self.control_relay([{'index': 0, 'op': 1}, {'index': 1, 'op': 0}])
        # self.arm_disarm(2)
        # self.set_ip_address([{'index': 1, 'ip': '113.232.197.13', 'port': 9016}])
        # self.set_ip_address([{'index': 2, 'ip': ''}])
        # self.set_phone_number([{'index': 7, 'phone': '18642304486', 'call': 1, 'sms': 0}])
        self.inquiry_current_data()

        try:
            start, = struct.unpack("B", d[0:1])
            if start != self.start:
                print 'error: Receive data is not king pigeon protocol. data =', data
                self.send_msg(self.ori_rx.upper())
                return
            l, cmd, tp, cp = struct.unpack("<hBhh", d[1:DEVICE_BEGIN])
            self.length = l
            self.cmd = cmd
            self.tp = tp
            self.cp = cp
            print 'receive data from', self.host, self.port
            self.show(self.hex_rx)
            print 'cmd=0x{:X}'.format(cmd)
            if cmd in self.dispatch:
                return apply(self.dispatch[cmd])
            else:
                print 'Unknown cmd: {:#X}'.format(cmd)
        except struct.error, e:
            print '...exception:', e
            import traceback
            traceback.print_exc()
            # print '...error: Receive data is not king pigeon protocol.'

    @staticmethod
    def escape_string_receive(data):
        # 0xAA 0x05 --> 0xA5, 0xAA 0x0A --> 0xAA
        ret = data
        i = 1
        while i < len(ret):
            c, = struct.unpack("B", ret[i:i + 1])
            if c == 0xAA:
                i += 1
                m, = struct.unpack("B", ret[i:i + 1])
                if m == 0x05:
                    ret = ret[:i-1] + struct.pack('B', 0xA5) + ret[i+1:]
                elif m == 0x0A:
                    ret = ret[:i-1] + struct.pack('B', 0xAA) + ret[i+1:]
            i += 1
        # str_hex = ret.encode('hex').upper()
        # PigeonProtocol.show(str_hex)
        return ret

    @staticmethod
    def escape_string_send(data):
        # 0xA5 --> 0xAA 0x05, 0xAA --> 0xAA 0x0A
        ret = data
        i = 1
        while i < len(ret) - 1:
            c, = struct.unpack("B", ret[i:i + 1])
            if c == 0xA5:
                ret = ret[:i] + struct.pack('<BB', 0xAA, 0x05) + ret[i+1:]
                i += 1
            elif c == 0xAA:
                ret = ret[:i] + struct.pack('<BB', 0xAA, 0x0A) + ret[i+1:]
                i += 1
            i += 1
        # str_hex = ret.encode('hex').upper()
        # PigeonProtocol.show(str_hex)
        return ret

    @staticmethod
    def show(data, send=None):
        print 'send:' if send is not None else 'receive:', WmmTools.format_data(data)

    def close_timer(self):
        if self.timer is not None:
            self.timer.cancel()
            self.timer = None
            return

    def start_timer(self):
        if self.timer is not None:
            self.timer.cancel()
        self.timer = threading.Timer(TIMER_INTERVAL, self.ontimer)
        self.timer.daemon = True
        self.timer.start()

    def ontimer(self):
        self.tick += TIMER_INTERVAL
        self.time_out_tick += TIMER_INTERVAL

        for t in self.timer_func:
            t[0] += TIMER_INTERVAL
            if t[0] >= t[1]:
                t[0] = 0
                apply(t[2])

        if self.time_out_tick >= self.time_out_val:
            if self.time_out():
                return
        self.start_timer()
        return

    def ontimer_keep_alive(self):
        print 'keep alive'
        self.random_number()
        return

    def time_out(self):
        self.time_out_cnt += 1
        self.time_out_tick = 0
        print 'time out {}, {}, cnt={}'.format(self.host, self.port, self.time_out_cnt)
        if self.time_out_cnt >= 3:
            self.shutdown_request()
            return True
        return False

    def shutdown_request(self):
        self.close_timer()
        self.handle.server.shutdown_request(self.handle.request)

    def inquiry_device_id(self):
        """
        Inquiry the Device ID "0x94" (Downstream )
        Downstream Structure: A5 L1 L2 94 TP1 TP2 CP1 CP2 SUM1 SUM2 A5 
        :return: 
        """
        msg = self.generate_send_msg(cmd=0x94, length=MSG_HEAD_LENGTH, tp=1, cp=1, data=None)
        self.send_msg(msg)
        return

    def ack_inquiry_device_id(self):
        """
        Inquiry the Device ID "0x94" (Downstream ) -- RTU 返回的应答报文
        Upstream Structure: A5 L1 L2 94 TP1 TP2 CP1 CP2 ID1~15 SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        :return:
        """
        self.parse_device_id()
        print '...ack inquiry device id: {}'.format(self.device_id)

    def inquiry_current_data(self):
        """
        Inquiry the Current Data “0x97” （Downstream ）
        Downstream Structure: A5 L1 L2 97 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x97, length=MSG_HEAD_LENGTH, tp=1, cp=1, data=None)
        self.send_msg(msg)
        return

    def ack_inquiry_current_data(self):
        """
        Inquiry the Current Data “0x97” （Downstream ） --- RTU 返回的应答报文
        Upstream Structure: A5 L1 L2 97 TP1 TP2 CP1 CP2 ID1~15 DATA1~X SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        DATA1~X             DATA is the specific data, < Refer to the "Upload the Data1~X Definition Interpretation">;
                            Including the Alarm Value/GSM Signal/Relay Status/Alarm Value/External Power Status, etc.
        :return:
        """
        self.parse_device_id()
        self.parse_upload_data(self.ori_rx[DATA_BEGIN:], self.length - MSG_HEAD_LENGTH - 15)
        return

    def random_number(self):
        """
        0x80 ( 发起方：服务器 ) 同步时间  Random Number “0x80” （Downstream )
        Downstream Structure: A5 L1 L2 80 TP1 TP2 CP1 CP2 xx1 xx2 xx3 xx4 t1 t2 t3 t4 SUM1 SUM2 A5
        Character           Bytes   Description
        ---------           ------  ---------------------------------------------------------------------------------
        xx1 xx2 xx3 xx4     4B      Random Number
        t1 t2 t3 t4         4B      Utc Time(Little-Endian)
        :return:
        """
        length = MSG_HEAD_LENGTH + 8
        tm = time.time()
        self.generate_random()
        data = ''
        for i in range(4):
            data += struct.pack('<B', self.random[i])
        data += struct.pack('<I', tm)
        msg = self.generate_send_msg(cmd=0x80, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_random_number(self):
        """
        Random Number “0x80” (Downstream )同步时间，发起方：服务器。 本函数为 服务器 收到 设备 0x80 命令的应答
        Upstream Structure: A5 L1 L2 80 TP1 TP2 CP1 CP2 ID1~15 xx1 xx2 xx3 xx4 AA BB CC SUM1 SUM2 A5
        Character           Bytes   Description
        ---------           ------  ---------------------------------------------------------------------------------
        ID1~15              15B     Device ID
        xx1 xx2 xx3 xx4     4B      xx1^'j'^'e'^'i'^'6'
                                    xx2^'i'^'k'^'2'
                                    xx3^'n'^'e'^'0'
                                    xx4^'g'^'j'^'1'"
        AA                  10B     Model Number
        BB                  2B      Vice Model Number; The Normal Model=00, ODM Model=01~FF
        CC                  6B      Firmware Version
        :return:
            True    --- 校验不通过。 If incorrect or Time out more than 3 times, will kick out the device.
            False   --- 校验通过
        """
        self.parse_device_id()
        calc, model, vice_model, version = struct.unpack("<I10s2s6s", self.ori_rx[DATA_BEGIN:DATA_BEGIN+22])
        print calc, model, vice_model, version
        verify = self.verify_random(calc)
        print 'verify=', verify
        return not verify

    def control_relay(self, operation):
        """
        Control the Relay “0x99” ( Downstream )
        Downstream Structure: A5 L1 L2 99 TP1 TP2 CP1 CP2 Cnt Index operation SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Cnt         1B      Total quantity relays need to be Control
        Index       1B      Index is the Relay Channel Number，Index=0～3
        operation   1B      Operation=0~1
                            0=Open
                            1=Close (The close time is setting by the “0x85” Command, mode=1)
        :param operation:  list of dictionary
            [ {index: 0, op: 1}, {'index': 1, 'op': 0}]  -- Relay 1 close, relay 2 open
        :return:
        """
        cnt = len(operation)
        length = MSG_HEAD_LENGTH + cnt*2 + 1
        data = struct.pack('<B', cnt)
        for o in operation:
            data += struct.pack('<BB', o['index'], o['op'])
        msg = self.generate_send_msg(cmd=0x99, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_control_relay(self):
        """
        Control the Relay "0x99" --- RTU 应答 控制继电器命令
        Upstream Structure:A5 L1 L2 99 TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
         Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        code        1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN+1])
        print 'success =', success

    def arm_disarm(self, flag):
        """
        0x8F (发起方：服务器)设置布撤防命令. Program the Arm/Disarm Command "0x8F" (Downstream)
        0x8F (下行)报文数据包内容 Downstream Structure: A5 L1 L2 8F TP1 TP2 CP1 CP2 Arm SUM1 SUM2 A5
        字段名         长度( Byte)   数据类型    说明
        -----------    -----------    ----------  -------------------------------------------------------
        状态          1               整型        0 代表撤防
                                                  1 代表留守
                                                  2 代表布防
        :param flag: 状态， 0=Disarm, 1=Stay, 2=Arm
        :return:
        """
        length = MSG_HEAD_LENGTH + 1
        data = struct.pack('<B', flag)
        msg = self.generate_send_msg(cmd=0x8F, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_arm_disarm(self):
        """
        设置布撤防命令  0x8F ( 上 行)
        0x8F (上行)报文数据包内容  Upstream Structure: A5 L1 L2 8F TP1 TP2 CP1 CP2 ID1~15 SUM1 SUM2 A5
        字段名         长度( Byte)   数据类型    说明
        -----------    -----------    ----------  -------------------------------------------------------
        设备 ID        15             ASCII 码    具体 ASCII 码的解析算法参考<8.4.ASCII 码类型字段解包/组包样例代码>
        :return:
        """
        self.parse_device_id()
        return

    def set_ip_address(self, ip_address):
        """
        Set the IP Address “0x81”(Downstream)  (发起方：服务器)设置 IP 命令
        Downstream Structure: A5 L1 L2 81 TP1 TP2 CP1 CP2 Cnt Index ip port index ip port SUM1 SUM2 A5
        Character           Bytes   Description
        ---------           ------  ---------------------------------------------------------------------------------
        Cnt                 1B      Total quantity IP address, Max:2
        Index               1B      Index is Serial Number of the IP, Index=1~2
        Ip                          String, Max:32 bytes, End ='\0', if need to clear the IP, then just need to send
                                    '\0'，Not need Port.
        port                2B      Port
        :param ip_address: ip 地址 [ {'index': value, 'ip': ip address, 'port': port number}]
            Example 1: (Set the 1st IP: 113.232.197.13 Port:9016)
                [{'index': 1, 'ip': '113.232.197.13', 'port': 9016}]
                A5 18 00 81 01 00 01 00 01 01 31 31 33 2E 32 33 32 2E 31 39 37 2E 31 33 00 38 23 4C FC A5
            Example2: (Set the 2nd IP is Empty)
                [{'index': 2, 'ip': ''}]
                A5 08 00 81 01 00 01 00 01 02 00 71 FF A5
        :return:
        """
        cnt = len(ip_address)
        length = MSG_HEAD_LENGTH + 1
        data = struct.pack('<B', cnt)
        for o in ip_address:
            data += struct.pack('<B', o['index'])
            ip_len = len(o['ip'])
            for c in o['ip']:
                data += struct.pack('<B', ord(c))
            data += struct.pack('<B', 0)
            length += 1 + ip_len + 1
            if ip_len > 0:
                length += 2
                data += struct.pack('<H', o['port'])
        msg = self.generate_send_msg(cmd=0x81, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_set_ip_address(self):
        """
        设置 IP 命令  0x81 ( 上 行) Upstream Structure: A5 L1 L2 81 TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
        Character           Bytes   Description
        ---------           ------  ---------------------------------------------------------------------------------
        Device ID           15      ASCII
        code                1   `   1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'success =', success
        return

    def inquiry_ip_address(self):
        """
        Inquiry the IP Address “0x82” (Downstream )
        Downstream Structure: A5 L1 L2 82 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        length = MSG_HEAD_LENGTH
        msg = self.generate_send_msg(cmd=0x82, length=length, tp=1, cp=1, data=None)
        self.send_msg(msg)
        return

    def ack_inquiry_ip_address(self):
        """
        Inquiry the IP Address “0x82”  -- 服务器收到设备应答
        Upstream Structure: A5 L1 L2 82 TP1 TP2 CP1 CP2 ID1~15 Cnt Index ip port index ip port SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        Cnt         1B      Total quantity IP address, Max:2
        Index       1B      Index is Serial Number of the IP, Index=1~2
        Ip                  String, Max:32 bytes, End ='\0', if need to clear the IP, then just need to
                            send '\0', Not need Port.
        port        2B      Port
        :return: list of ip address
            [{'index': value, 'ip': ip address, 'port': port number}]
        """
        self.parse_device_id()
        ips = []
        p = DATA_BEGIN
        cnt, = struct.unpack("<B", self.ori_rx[p:p+1])
        p += 1
        for i in xrange(cnt):
            index, = struct.unpack("<B", self.ori_rx[p:p+1])
            p += 1
            ip_addr = ''
            c, = struct.unpack("<B", self.ori_rx[p:p+1])
            p += 1
            while c != 0:
                ip_addr += chr(c)
                c, = struct.unpack("<B", self.ori_rx[p:p+1])
                p += 1
            port = None
            if ip_addr != '':
                port, = struct.unpack("<H", self.ori_rx[p:p+2])
                p += 2
            ips.append({'index': index, 'ip': ip_addr, 'port': port})
        return ips

    def process_alarm(self):
        """
        Alarm “0x70” (Upstream)
        Upstream Structure :A5 L1 L2 70 TP1 TP2 CP1 CP2 ID1~15 Type addr alm DATA1~X SUM1 SUM2 A5
        Downstream Structure:A5 L1 L2 70 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        Upstream:
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        Type        1B      Alarm Type, < Refer to the "Upload the Data1~X Definition Interpretation" >
        addr        1B      Alarm Device Address, < Refer to the "Upload the Data1~X Definition Interpretation" >
        ALM         1B      Status, if the Type=0x03 (DIN); then
                                0=Recovery;
                                1=NO/NC Alarm;
                                2=Interval Alarm;
                                3=Pulse Counter Total Value Alarm,
                                4=Change Alarm;
                            if the Type=0x05 (Relay) then
                                1=Close; 0=Open;
                            if the Type=0x02 (AIN) or 0x04 (Temperature & Humidity);
                                0=Recovery;
                                1=Low Alarm;
                                2=High Alarm;
        DATA1~X             DATA is the specific data, < Refer to the "Upload the Data1~X Definition Interpretation">;
                            Including the Alarm Value/GSM Signal/Relay Status/Alarm Value/External Power Status, etc.
        :return:
        """
        self.parse_device_id()
        alm_type, addr, alm = struct.unpack("<BBB", self.ori_rx[DATA_BEGIN:DATA_BEGIN+3])
        print 'type={}, addr={}, alm={}'.format(alm_type, addr, alm)
        self.parse_upload_data(self.ori_rx[DATA_BEGIN+3:], self.length-MSG_HEAD_LENGTH-15-3)

        msg = self.generate_send_msg(cmd=0x70)
        self.send_msg(msg)
        return

    def upload_data(self):
        """
        Upload the data in Timer “0x71” ( Upstream )
        Upstream Structure :  A5 L1 L2 71 TP1 TP2 CP1 CP2 ID1~15 DATA1~X SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        DATA1~X             DATA is the specific data, < Refer to the "Upload the Data1~X Definition Interpretation">;
                            Including the Alarm Value/GSM Signal/Relay Status/Alarm Value/External Power Status, etc.
        :return:
        """
        self.parse_device_id()
        self.parse_upload_data(self.ori_rx[DATA_BEGIN:], self.length - MSG_HEAD_LENGTH - 15)
        msg = self.generate_send_msg(cmd=0x71)
        self.send_msg(msg)
        return

    def set_phone_number(self, phone_numbers):
        """
        Set the Phone Number Command "0x83" ( Downstream )
        Downstream Structure: A5 L1 L2 83 TP1 TP2 CP1 CP2 Cnt Index phone fun1 fun2 index phone fun1 fun2 SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Cnt         1B      Total quantity phone number, Max:10
        Index       1B      Index is Serial Number of the phone number, Index=0~9
        phone               String, Max: 22 bytes, End ='\0', if need to clear the phone number, then just
                            need to send '\0', Not need function code.
        fun1        1B      Call Function, Disable=0, Enable=1
        fun2        1B      SMS Function, Disable=0, Enable=1
            For Example: (Set the the 7 th User's phone number, the phone number is 18642304486，function code1=1,
            function code2=0)
            [{'index': 7, 'phone': '18642304486', 'call': 1, 'sms': 0}]
            A5 15 00 83 01 00 01 00 01 07 31 38 36 34 32 33 30 34 34 38 36 00 01 00 1E FD A5
        :param phone_numbers:  [{'index': int, 'phone': string, 'call': int, 'sms': int}]
        :return:
        """
        cnt = len(phone_numbers)
        length = MSG_HEAD_LENGTH + cnt * 3 + 1
        data = struct.pack('<B', cnt)
        for o in phone_numbers:
            data += struct.pack('<B', o['index'])
            phone_len = len(o['phone'])
            length += phone_len + 1
            for c in o['phone']:
                data += struct.pack('<B', ord(c))
            data += struct.pack('<B', 0)
            data += struct.pack('<BB', o['call'], o['sms'])
        msg = self.generate_send_msg(cmd=0x83, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_set_phone_number(self):
        """
        Set the Phone Number Command "0x83" --- RTU 应答 设置电话号码命令
        Upstream Structure: A5 L1 L2 83 TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        code        1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'success =', success
        return

    def inquiry_phone_number(self):
        """
        Inquiry the Phone Number Command “0x84” （Downstream ）
        Downstream Structure: A5 L1 L2 84 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x84, length=MSG_HEAD_LENGTH, tp=1, cp=1, data=None)
        self.send_msg(msg)
        return

    def ack_inquiry_phone_number(self):
        """
        Inquiry the Phone Number Command “0x84” （Downstream ） --- RTU 应答 查询电话号码命令
        Upstream Structure: A5 L1 L2 84 TP1 TP2 CP1 CP2 ID1~15 Cnt Index phone fun1 fun2 index phone fun1 fun2 SUM1
                            SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        Cnt         1B      Total quantity phone number, Max:10
        Index       1B      Index is Serial Number of the phone number, Index=0~9
        phone               String, Max: 22 bytes, End ='\0', if need to clear the phone number, then just
                            need to send '\0', Not need function code.
        fun1        1B      Call Function, Disable=0, Enable=1
        fun2        1B      SMS Function, Disable=0, Enable=1
        :return: list of phone number --- [{'index': int, 'phone': string, 'call': int, 'sms': int}]
        """
        self.parse_device_id()
        phone_numbers = []
        p = DATA_BEGIN
        cnt, = struct.unpack("<B", self.ori_rx[p:p + 1])
        p += 1
        for i in xrange(cnt):
            index, = struct.unpack("<B", self.ori_rx[p:p + 1])
            p += 1
            phone = ''
            c, = struct.unpack("<B", self.ori_rx[p:p + 1])
            p += 1
            while c != 0:
                phone += chr(c)
                c, = struct.unpack("<B", self.ori_rx[p:p + 1])
                p += 1
            call, sms = None, None
            if phone != '':
                call, sms = struct.unpack("<bb", self.ori_rx[p:p + 2])
                p += 2
            phone_numbers.append({'index': index, 'phone': phone, 'call': call, 'sms': sms})
        # print phone_numbers
        return phone_numbers

    def parse_device_id(self):
        dev_id, = struct.unpack("<15s", self.ori_rx[DEVICE_BEGIN:DATA_BEGIN])
        if self.device_id is None:
            self.device_id = dev_id
        if self.device_id != dev_id:
            self.handle.server.del_device_client(self.device_id)
            self.device_id = dev_id
        self.handle.server.add_device_client(dev_id, self)
        print 'device id =', dev_id
        return

    def del_device_protocol(self):
        self.handle.server.del_device_client(self.device_id)

    def generate_random(self):
        self.random = random.sample(range(10, 240), 4)

    def verify_random(self, val):
        """
        校验 同步时间命令，设备返回命令是否正确
        :param val:     被校验的值
        :return:
            True -- 校验通过。 False -- 校验失败
        """
        if self.random is None or len(self.random) < 4:
            return False
        x1 = self.random[0] ^ ord('j') ^ ord('e') ^ ord('i') ^ ord('6')
        x2 = self.random[1] ^ ord('i') ^ ord('k') ^ ord('2')
        x3 = self.random[2] ^ ord('n') ^ ord('e') ^ ord('0')
        x4 = self.random[3] ^ ord('g') ^ ord('j') ^ ord('1')

        # calc = x4 * 2**24 + x3 * 2**16 + x2 * 2**8 + x1
        calc = (x4 << 24) + (x3 << 16) + (x2 << 8) + x1
        if calc != val:
            return False
        return True

    @staticmethod
    def calc_sum(data, b=1, e=None):
        # 2B (LSB First, Sum Negation，from “Length” to “SUM”)
        # Tips: Sum is the origin Sum, not after Escape String.
        s = 0
        data_len = len(data) if e is None else len(data[:e])
        for i in range(b, data_len):
            c, = struct.unpack("B", data[i:i+1])
            s += c
        sum_tx = ~s
        return sum_tx

    def generate_send_msg(self, cmd=None, length=5, tp=1, cp=1, data=None):
        """
        构造命令报文
        :param cmd:         命令码
        :param length:      报文长度
        :param tp:          总包数
        :param cp:          当前包序号
        :param data:        报文内容
        :return:
        """
        cmd = self.cmd if cmd is None else cmd
        if cmd is None:
            return None
        msg = struct.pack('<BHBHH', self.start, length, cmd, tp, cp)
        if data is not None:
            msg += data
        sum_tx = self.calc_sum(msg)
        msg += struct.pack('<hB', sum_tx, self.end)
        return msg

    def send_msg(self, data):
        d = self.escape_string_send(data)
        self.handle.request.sendall(d)
        self.hex_tx = d.encode('hex').upper()
        self.show(self.hex_tx, send=True)
        return

    def parse_upload_data(self, data, length):
        """
        解析服务器收到报文中的 upload data 域
        :param data:        upload data 域
            字段结构体      字段名       长度(Byte)    数据类型       说明
            ------------    --------     ------------   ----------     ----------------------------------
                            起始         2               整型          默认 0x7F 0x7F
            时间            年           1               整型          年份只取后两位，服务器须在年份前增加“20”。
                                                                       例如 2018 年，报文内容为 0x12
                            月           1               整型
                            日           1               整型
                            时           1               整型
                            分           1               整型
                            秒           1               整型
            数据块1        传感器类型    1               整型          ( 详情见 7 7. .1 1  传感器类型)
                           传感器地址    1               整型          ( 详情见 7 7. .2 2  传感器地址)
                           数据          4          当传感器类型为       具体浮点数(小端模式，低
                                                    0x01 、 0x02         位在前)类型字段的解包和
                                                    (AIN)、0x04(温    组包算法参考<8.3 浮点型
                                                    湿度)时，该数       (小端模式)类型字段解包/
                                                    据类型为浮点型       组包样例代码>
                                                    (小端模式)
            数据块2        传感器类型    1               整型
                           传感器地址    1               整型
                           数据          4
            数据块N        传感器类型    1               整型
                           传感器地址    1               整型
                           数据          4
            =====================================================================================
            "Type" Definition Interpretation
                0x02  AIN (Floating Number)
                0x03  DIN
                0x04  Temperature & Humidity (Floating Number)
                0x05  DOUT
                0x10  GSM Signal
                0x11  Arm/Disarm Status
                0x30  External AC Power Status
            =====================================================================================
            "Address" Definition Interpretation
                If the "Type"= 0x01(Sensor) , 0x02(AIN), 0x05(DOUT), the "Address" Interpretation:
                    0x00  Sensor 1
                    0x01  Sensor 2
                    0x02  Sensor 3
                    0x03  Sensor 4
                If the "Type"=0x03 (DIN), the "Address" Interpretation:
                    0x00  DIN0
                    0x01  DIN1 ((Tips: When the DIN1 Use as Arm/Disarm Switch, then will not upstream this data.)
                    0x02  DIN2
                    0x03  DIN3
                    0x04  DIN4
                    0x05  DIN5
                    Tips: In the Data, "bit27~bit0" is the specific value;
                    "bit28～31" is the Type,1=NC, 2=NO, 3=Change, 5=Counter
                    When the "bit28～31" =1,2,3; then Data =1=Open; Data =0= Close;
                    When the "bit28～31" =5, then it will use as a Counter, the data is the specific value;
                If the "Type"=0x04 (Temperature & Humidity), the "Address" Interpretation:
                    0x00  Temperature 1 (Temperature is Even)
                    0x01  Humidity 1 (Humidity is Odd)
                If the "Type"=0x05 (DOUT Status), the "Address" Interpretation:
                    0x0  DOUT 0 Status      0= Open(断开),1= Close(闭合)
                    0x1  DOUT 1 Status      0= Open,1= Close
                    0x2  DOUT 2 Status      0= Open,1= Close
                    0x3  DOUT 3 Status      0= Open,1= Close
                If the "Type"=0x11 (Arm/Disarm Status), the "Address" Interpretation:
                    0x00  Arm/Disarm Status     0=Disarm, 1=Stay, 2=Arm
                If the "Type"=0x10 (GSM Signal), the "Address" Interpretation:
                    0x10  GSM Signal (Floating Number)
                    0x00  GSM Signal (Integer), This address is to avoid confrontations with the S26x Models
                If the "Type"=0x30 (External Power Status), the "Address" Interpretation:
                当传感器类型为电源状态 (0x30) 时的址位解释
                    地址                            数据说明
                    0x00    代表电源电压(浮点)      RTU 设备本身外接电源电压
                    0x01    AC 电源状态(整型)       0 代表 消失(掉电)，1 代表正常
                    0x02    代表电源电压(整型)
                    0x30    AC 电源状态(浮点)       0 代表 消失(掉电)，1 代表正常
                    0x10    电池电压(浮点)          RTU 设备本身电池电压
        :param length:      length of upload data
        :return:
        """
        s1, s2 = struct.unpack("<BB", data[0:2])
        p = 2
        if s1 != 0x7f or s2 != 0x7f:
            print 'error: Upload data start is NOT 0x7f 0x7f'
            return
        year, month, day, hour, minute, second = struct.unpack('<BBBBBB', data[p:p+6])
        p += 6
        print 'Time: {}-{:0>2d}-{:0>2d} {:0>2d}:{:0>2d}:{:0>2d}'.format(2000+year, month, day, hour, minute, second)
        while p < length:
            sensor_type, addr = struct.unpack('<BB', data[p:p + 2])
            if sensor_type == 0x05:
                sensor_data, = struct.unpack('<I', data[p + 2:p + 6])
            elif sensor_type == 0x3:
                tmp, = struct.unpack('<I', data[p + 2:p + 6])
                sensor_data = tmp & 0x0FFFFFFF
                din_type = tmp >> 28
                print 'din type={}'.format(din_type)
            elif sensor_type == 0x11:
                sensor_data, = struct.unpack('<I', data[p + 2:p + 6])
            elif sensor_type == 0x1 or sensor_type == 0x2:
                sensor_data, = struct.unpack('<f', data[p + 2:p + 6])
            elif sensor_type == 0x4:
                sensor_data, = struct.unpack('<f', data[p + 2:p + 6])
            elif sensor_type == 0x30:
                if addr == 0x0:
                    sensor_data, = struct.unpack('<f', data[p + 2:p + 6])
                elif addr == 0x30:
                    sensor_data, = struct.unpack('<f', data[p + 2:p + 6])
                elif addr == 0x10:
                    sensor_data, = struct.unpack('<f', data[p + 2:p + 6])
                else:
                    sensor_data, = struct.unpack('<I', data[p + 2:p + 6])
            else:
                sensor_data, = struct.unpack('<I', data[p + 2:p + 6])
            p += 6
            print 'type={}, address={}, data={}'.format(sensor_type, addr, sensor_data)
        self.upload_data = None
        return


class WmmServer(object):
    def __init__(self, port=9999, host='0.0.0.0'):
        self.port = port
        self.host = host
        self.server = WmmTCPServer((host, port), WmmTCPHandler)
        cur_thread = threading.current_thread()
        print "Tcp server start! (ip=%s, port=%d), entrance thread: %s" % (host, port, cur_thread.getName())

    def __del__(self):
        self.server.shutdown()
        self.server.server_close()

    def run(self):
        # Start a thread with the server -- that thread will then start one
        # more thread for each request
        server_thread = threading.Thread(target=self.server.serve_forever, name='TCPServerThread')
        # Exit the server thread when the main thread terminates
        server_thread.daemon = True
        server_thread.start()
        print "Server loop running in thread:", server_thread.name


if __name__ == "__main__":
    if len(sys.argv) > 1:
        try:
            tcp_port = int(sys.argv[1])
        except ValueError:
            print 'please input port number.'
            sys.exit(1)
    else:
        tcp_port = 3456
    kp_server = WmmServer(tcp_port)
    kp_server.run()
    while True:
        time.sleep(0.1)
