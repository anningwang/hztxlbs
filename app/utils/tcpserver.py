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
import copy

from app.models import Device
from app import db, app

from wmmtools import WmmTools

BUF_SIZE = 4096         # 从socket每次读取的数据长度
START_CHAR = 0xA5       # 协议开始字符
END_CHAR = 0xA5         # 协议终结字符

DEVICE_BEGIN = 8        # 设备ID开始地址
DATA_BEGIN = 23         # 数据区开始地址
MSG_HEAD_LENGTH = 5     # 报文头长度，从cmd到cp  cmd(1) tp(2) cp(2)

TIMER_INTERVAL = 1

RELAY_CTRL_MODE_VIA_INTER_LOCK = 0          # 0 为 报警与联动事件控制方式
RELAY_CTRL_MODE_VIA_APP = 1                 # 1 为 app 控制方式


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

    def arm(self, device_id, state):
        """
        设备布防/撤防
        :param device_id:   设备 id, string
        :param state:       0 disarm; 2 arm
        :return:
        """
        if device_id in self.device_client:
            self.device_client[device_id].arm_disarm(state)
        else:
            print 'device id ({}) not exist.'.format(device_id)


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


# 返回元素比较key
def take_no(elem):
    return elem['no']


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
            0x82: self.ack_get_ip_address,
            0x83: self.ack_set_phone_number,
            0x84: self.ack_get_phone_number,
            0x85: self.ack_set_relay,
            0x86: self.ack_get_relay,
            0x87: self.ack_set_ain,
            0x88: self.ack_get_ain,
            0x89: self.ack_set_din,
            0x8A: self.ack_get_din,
            0x8B: self.ack_set_inter_lock,
            0x8C: self.ack_get_inter_lock,
            0x8D: self.ack_set_timed_task,
            0x8E: self.ack_get_timed_task,
            0x8F: self.ack_arm_disarm,
            0x94: self.ack_inquiry_device_id,
            0x97: self.ack_get_current_data,
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
        # self.get_current_data()
        # self.set_relay(mode=0, control_info=[{'index': 0, 'closeTime': 5, 'openTime': 2, 'freq': 0},
        #                                     {'index': 1, 'closeTime': 3, 'openTime': 1, 'freq': 0}])
        # self.get_relay(RELAY_CTRL_MODE_VIA_INTER_LOCK)
        # self.set_ain(mode=0, param=[{'index': 0, 'type': 3, 'maxVal': 100, 'minVal': 0, 'hLimit': 35, 'lLimit': 0,
        #                             'confirmTime': 4, 'hour24': 1},
        #                            {'index': 1, 'type': 3, 'maxVal': 200, 'minVal': 20, 'hLimit': 40,
        #                             'lLimit': 10, 'confirmTime': 2, 'hour24': 0}])
        # self.get_ain(0)
        # self.set_din([{'index': 0, 'type': 5, 'confirmTime': 2, 'hour24': 1, 'startVal': 0, 'interval': 5,
        #               'total': 10}, {'index': 1, 'type': 3, 'confirmTime': 5, 'hour24': 0}])
        # self.get_din()
        # self.set_inter_lock([{'event': 21, 'action': 7}, {'event': 37, 'action': 9}])
        # self.get_inter_lock()
        # self.set_timed_task([{'no': 10, 'valid': 1, 'week': 2, 'hour': 10, 'minute': 30, 'event': 6},
        #                     {'no': 1, 'valid': 1, 'week': 7, 'hour': 8, 'minute': 5, 'event': 1}])
        self.get_timed_task()

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
        msg = self.generate_send_msg(cmd=0x94, length=MSG_HEAD_LENGTH, tp=1, cp=1)
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

    def get_current_data(self):
        """
        Inquiry the Current Data “0x97” （Downstream ）
        Downstream Structure: A5 L1 L2 97 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x97, length=MSG_HEAD_LENGTH, tp=1, cp=1)
        self.send_msg(msg)
        return

    def ack_get_current_data(self):
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
        Index       1B      Index is the Relay Channel Number，Index=0~3
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
        print 'ack control relay success = {}'.format(success)

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
        code                1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'ack set ip address: success ={}'.format(success)
        return

    def get_ip_address(self):
        """
        Inquiry the IP Address “0x82” (Downstream )
        Downstream Structure: A5 L1 L2 82 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        length = MSG_HEAD_LENGTH
        msg = self.generate_send_msg(cmd=0x82, length=length, tp=1, cp=1)
        self.send_msg(msg)
        return

    def ack_get_ip_address(self):
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

    def set_relay(self, mode, control_info):
        """
        Program the Relay Command “ 0x85” （Downstream ）--- （发起方：服务器）设置继电器命令
        Downstream Structure: A5 L1 L2 85 TP1 TP2 CP1 CP2 mode Cnt Index CloseTime OpenTime freq index CloseTime
                              OpenTime freq SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        mode        1B      Control Method,0=Inter-Lock Link,1=Control via APP
                                0 为报警与联动事件控制方式,  1 为 app 控制方式
        Cnt         1B      Totally how many relays need to be Program
        Index       1B      Index is the Relay Channel Number，Index=0~3
        CloseTime   2B      Close Time=0~10000, 0= Always Close; Unit: Second
        OpenTime    2B      Open Time=0~10000; 0= Always Close; Unit: Second
        freq        2B      Frequency, freq=0~1000, 0=No Action, 1000=1000 Times; Unit: Times
        :param mode:  Control Method,0=Inter-Lock Link,1=Control via APP
        :param control_info:  list of relay control information
            [{'index': int, 'closeTime': int, 'openTime': int, 'freq': int}]
        =======================================================================================================
        For Example ：
        Example 1 ：(Program the relay control via Inter-lock, totally need to program 2 relays, relay 0 needs to close
        5 seconds, open 2 seconds, frequency is 0; relay 1 close 3 seconds, open 1 second, frequency is 0)
        Server Program the Relay Downstream:
        A5 15 00 85 01 00 01 00 00 02 00 05 00 02 00 00 00 01 03 00 01 00 00 00 55 FF A5
        mode=0, control_info=[{'index': 0, 'closeTime': 5, 'openTime': 2, 'freq': 0},
            {'index': 1, 'closeTime': 3, 'openTime': 1, 'freq': 0}]
        :return:
        """
        cnt = len(control_info)
        length = MSG_HEAD_LENGTH + 2 + cnt * 7
        data = struct.pack('<BB', mode, cnt)
        for o in control_info:
            data += struct.pack('<bHHH', o['index'], o['closeTime'], o['openTime'], o['freq'])
        msg = self.generate_send_msg(cmd=0x85, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_set_relay(self):
        """
        Program the Relay Command “ 0x85” --- RTU 应答 设置继电器命令
        Upstream Structure: A5 L1 L2 85 TP1 TP2 CP1 CP2 ID1~15 mode bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        mode        1       Control Method,0=Inter-Lock Link,1=Control via APP
        code        1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        mode, success = struct.unpack("<bb", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 2])
        print 'ack program relay: mode = {}, success = {}'.format(mode, success)
        return

    def get_relay(self, mode):
        """
        Inquiry the Relay Configuration “0x86” （ Downstream ） 发起方：服务器，查询继电器命令
        Downstream Structure: A5 L1 L2 86 TP1 TP2 CP1 CP2 mode SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        mode        1       Control Method,0=Inter-Lock Link,1=Control via APP
        =====================================================================================================
        For Example ：
            Server Downstream: (Inquiry the Inter-lock Relay configuration )
            A5 06 00 86 01 00 01 00 00 71 FF A5

            Server Downstream: (Inquiry the APP Relay configuration )
            A5 06 00 86 01 00 01 00 01 70 FF A5
        :param mode: Control Method,0=Inter-Lock Link,1=Control via APP
        :return:
        """
        length = MSG_HEAD_LENGTH + 1
        data = struct.pack('<B', mode)
        msg = self.generate_send_msg(cmd=0x86, length=length, tp=1, cp=1, data=data)
        self.send_msg(msg)
        return

    def ack_get_relay(self):
        """
        Inquiry the Relay Configuration “0x86”  --- RTU 应答 查询继电器命令
        Upstream Structure: A5 L1 L2 86 TP1 TP2 CP1 CP2 ID1~15 mode Cnt Index CloseTime OpenTime freq index
                            CloseTime OpenTime freq SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        mode        1B      Control Method,0=Inter-Lock Link,1=Control via APP
                                0 为报警与联动事件控制方式,  1 为 app 控制方式
        Cnt         1B      Totally how many relays need to be Program
        Index       1B      Index is the Relay Channel Number，Index=0~3
        CloseTime   2B      Close Time=0~10000, 0= Always Close; Unit: Second
        OpenTime    2B      Open Time=0~10000; 0= Always Close; Unit: Second
        freq        2B      Frequency, freq=0~1000, 0=No Action, 1000=1000 Times; Unit: Times
        :return: tuple of relay configuration
            ( mode, [{'index': int, 'closeTime': int, 'openTime': int, 'freq': int}] )
        """
        self.parse_device_id()
        relay_cfg = []
        p = DATA_BEGIN
        mode, cnt, = struct.unpack("<BB", self.ori_rx[p:p+2])
        p += 2
        for i in xrange(cnt):
            index, close_time, open_time, freq = struct.unpack("<bHHH", self.ori_rx[p:p+7])
            p += 7
            relay_cfg.append({'index': index, 'closeTime': close_time, 'openTime': open_time})
        return mode, relay_cfg

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
        print 'ack set phone number: success ={}'.format(success)
        return

    def get_phone_number(self):
        """
        Inquiry the Phone Number Command “0x84” （Downstream ）
        Downstream Structure: A5 L1 L2 84 TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x84, length=MSG_HEAD_LENGTH, tp=1, cp=1)
        self.send_msg(msg)
        return

    def ack_get_phone_number(self):
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

    def set_ain(self, mode, param):
        """
        Program the AIN Parameter Command “0x87” （Downstream ）
        Downstream Structure: A5 L1 L2 85 TP1 TP2 CP1 CP2 mode Cnt Index Type maxvalue minvalue HLimit LLimit
            confirmTime 24hr Index Type maxvalue minvalue HLimit LLimit confirmTime 24hr SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        mode        1B      AIN=0; Temperature&Humidity=1
        Cnt         1B      Total quantity group of the Data (Each Group=Index~24hr)
        Index       1B      When the “Mode”=0, then Index=0~6, Analog Channel Number
                            When the “Mode”=1, Then Index=0~1, 0=Temperature,1=Humidity
        Type        1B      When the “Mode”=0,then Type=0~3;
                                0= Disable
                                1=Sensor Type 0~5V
                                2=Sensor Type 0~20mA
                                3=Sensor Type 4~20mA
                            When the “Mode”=1, then Type=0~1;
                                0= Disable
                                1= Enable
        maxvalue    4B      Max(Floating Number), “-9999.99~9999.99”,when “Mode”=1,then this value is invalid.
        minvalue    4B      Min(Floating Number) , “-9999.99~9999.99”,when “Mode”=1,then this value is invalid.
        HLimit      4B      Threshold High(Floating Number) , “-9999.99~9999.99”
        LLimit      4B      Threshold Low(Floating Number) , “-9999.99~9999.99”
        confirmTime 2B      Alarm Verify Time (Integer),Max: 9999. 单位为秒
        24hr        1B      24*7hours arm, cannot be disarm, Enable=1;Disable=0. 是否 24 小时监控
        =====================================================================================================
        For Example ：
            Example 1: (Program the AIN0=4~20mA,Measuring Range:0~100, Threshold High=35, Threshold Low=0, Alarm verify
                time=4 Seconds, Enable 24hours mode; Program the AIN1=4~20mA,Measuring Range:20~200, Threshold High=40,
                Threshold Low=10, Alarm verify time=2 Seconds, Disable 24hours mode)
                Server Downstream:
                A5 31 00 87 01 00 01 00 00 02 00 03 00 00 C8 42 00 00 00 00 00 00 0C 42 00 00 00 00 04 00 01 01 03 00
                00 48 43 00 00 A0 41 00 00 20 42 00 00 20 41 02 00 00 AE FB A5
                mode=0, param=[{'index': 0, 'type': 3, 'maxVal': 100, 'minVal': 0, 'hLimit': 35, 'lLimit': 0,
                'confirmTime': 4, 'hour24': 1}, {'index': 1, 'type': 3, 'maxVal': 200, 'minVal': 20, 'hLimit': 40,
                'lLimit': 10, 'confirmTime': 2, 'hour24': 0}]
        :param mode:    AIN=0; Temperature&Humidity=1
        :param param: list of parameter
            [ { 'index': int, 'type': int, 'maxVal': float, 'minVal':float, 'hLimit': float, 'lLimit': float,
                'confirmTime': int, 'hour24': int} ]
        :return:
        """
        cnt = len(param)
        data = struct.pack('<BB', mode, cnt)
        for o in param:
            data += struct.pack('<BBffffHB', o['index'], o['type'], o['maxVal'], o['minVal'], o['hLimit'], o['lLimit'],
                                o['confirmTime'], o['hour24'])
        msg = self.generate_send_msg(cmd=0x87, data=data)
        self.send_msg(msg)
        return

    def ack_set_ain(self):
        """
        Program the AIN Parameter Command “0x87” --- RTU 应答 设置AIN 参数命令
        Upstream Structure: A5 L1 L2 85 TP1 TP2 CP1 CP2 ID1~15 mode bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        mode        1       AIN=0; Temperature&Humidity=1
        code        1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        mode, success = struct.unpack("<bb", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 2])
        print 'ack program ain: mode = {}, success = {}'.format(mode, success)
        return

    def get_ain(self, mode):
        """
        Inquiry the AIN Parameter Command “0x88” （Downstream ）
        Downstream Structure: A5 L1 L2 88 TP1 TP2 CP1 CP2 mode SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        mode        1B      AIN=0; Temperature & Humidity=1
        :param mode:    AIN=0; Temperature & Humidity=1
        :return:
        """
        data = struct.pack('<B', mode)
        msg = self.generate_send_msg(cmd=0x88, data=data)
        self.send_msg(msg)
        return

    def ack_get_ain(self):
        """
        Inquiry the AIN Parameter Command “0x88” （Downstream ） --- RTU 应答 查询 Ain 参数命令
        Upstream Structure: A5 L1 L2 88 TP1 TP2 CP1 CP2 ID1~15 mode Cnt Index Type maxvalue minvalue HLimit LLimit
            confirmTime 24hr Index Type maxvalue minvalue HLimit LLimit confirmTime 24hr SUM1 SUM2
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        mode        1B      AIN=0; Temperature&Humidity=1
        Cnt         1B      Total quantity group of the Data (Each Group=Index~24hr)
        Index       1B      When the “Mode”=0, then Index=0~6, Analog Channel Number
                            When the “Mode”=1, Then Index=0~1, 0=Temperature,1=Humidity
        Type        1B      When the “Mode”=0,then Type=0~3;
                                0= Disable
                                1=Sensor Type 0~5V
                                2=Sensor Type 0~20mA
                                3=Sensor Type 4~20mA
                            When the “Mode”=1, then Type=0~1;
                                0= Disable
                                1= Enable
        maxvalue    4B      Max(Floating Number), “-9999.99~9999.99”,when “Mode”=1,then this value is invalid.
        minvalue    4B      Min(Floating Number) , “-9999.99~9999.99”,when “Mode”=1,then this value is invalid.
        HLimit      4B      Threshold High(Floating Number) , “-9999.99~9999.99”
        LLimit      4B      Threshold Low(Floating Number) , “-9999.99~9999.99”
        confirmTime 2B      Alarm Verify Time (Integer),Max: 9999. 单位为秒
        24hr        1B      24*7hours arm, cannot be disarm, Enable=1;Disable=0. 是否 24 小时监控
        =====================================================================================================
        For Example ：
            Example 1:
            Server Downstream:
            A5 06 00 88 01 00 01 00 00 6F FF A5
            Device Answer:
            A5 6A 00 88 01 00 01 00 38 36 33 38 33 35 30 32 34 37 34 32 37 35 36 00 04 00 03 00 00 C8 42 00 00 00 00 00
            00 0C 42 00 00 00 00 04 00 01 01 03 00 00 48 43 00 00 A0 41 00 00 20 42 00 00 20 41 02 00 00 02 00 00 00 00
            00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 03 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
            00 57 F8 A5
        :return: tuple of parameter
            mode, [{'index': int, 'type': int, 'maxVal': float, 'minVal':float, 'hLimit': float, 'lLimit': float,
                'confirmTime': int, 'hour24': int}]
        """
        self.parse_device_id()
        ain_param = []
        p = DATA_BEGIN
        mode, cnt, = struct.unpack("<BB", self.ori_rx[p:p + 2])
        p += 2
        for i in xrange(cnt):
            index, ain_type, max_val, min_val, h, l, confirm, hr24 = struct.unpack("<BBffffHb", self.ori_rx[p:p + 21])
            p += 21
            ain_param.append({'index': index, 'type': ain_type, 'maxVal': max_val, 'minVal': min_val,
                              'hLimit': h, 'lLimit': l, 'confirmTime': confirm, 'hour24': hr24})
        return mode, ain_param

    def set_din(self, param):
        """
        Program the DIN Parameter Command “0x89” （Downstream ）
        Downstream Structure: A5 L1 L2 89 TP1 TP2 CP1 CP2 Cnt Index Type confirmTime 24hr startValue interval total
        Index Type confirmTime 24hr SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Cnt         1B      Total quantity group of the Data (Each Group=Index~24hr)
        Index       1B      Index is Channel Number of the DIN, Index=0~8
        Type        1B      0 =Disable; 1=NO; 2=NC; 3=Change; 4=Disarm/arm; 5=Counter
        confirmTime 2B      Alarm Verify Time (Integer),Max: 9999
        24hr        1B      24*7hours arm, cannot be disarm,Enable=1;Disable=0
        startValue  4B      Start Value(Integer),Max: 999999 ,If “Type” ≠5,then this value is invalid
                            当 type 为 5 时传输此值，否则不传（下同）
        interval    4B      Step Alarm Value (Integer),Max:999999, If “Type” ≠5,then this value is invalid.
        total       4B      Total Alarm Value(Integer)，Max:999999, If “Type” ≠5,then this value is invalid.
        =====================================================================================================
        For Example： ： (Program the DIN0 as Counter, Alarm verify time is 2 Seconds, Enable 24 hours mode, Start
        Value=0, Step Alarm Value=5, Total Alarm value=10;Program the DIN1 as Change, Alarm Verify Time is 5 Seconds,
        Disable 24 hours mode)
        Server Downstream:
        A5 1C 00 89 01 00 01 00 02 00 05 02 00 01 00 00 00 00 05 00 00 00 0A 00 00 00 01 03 05 00 00 36 FF A5
        [{'index': 0, 'type': 5, 'confirmTime': 2, 'hour24': 1, 'startVal': 0, 'interval': 5, 'total': 10},
         {'index': 1, 'type': 3, 'confirmTime': 5, 'hour24': 0}]
        :param param: list of din parameter
            [{'index': int, 'type': int, 'confirmTime': int, 'hour24': int, 'startVal': int, 'interval': int,
            'total': int}]
        :return:
        """
        cnt = len(param)
        data = struct.pack('<B', cnt)
        for o in param:
            data += struct.pack('<BBHb', o['index'], o['type'], o['confirmTime'], o['hour24'])
            if o['type'] == 5:
                data += struct.pack('<III', o['startVal'], o['interval'], o['total'])
        msg = self.generate_send_msg(cmd=0x89, data=data)
        self.send_msg(msg)
        return

    def ack_set_din(self):
        """
        Program the DIN Parameter Command “0x89” --- RTU 应答 设置 DIN 参数命令
        Upstream Structure: A5 L1 L2 89 TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        code        1       1 = success, 0 = error
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("<b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'ack set din: success = {}'.format(success)
        return

    def get_din(self):
        """
        Inquiry the DIN Parameter Command “0x8A” （Downstream ）
        Downstream Structure: A5 L1 L2 8A TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x8A)
        self.send_msg(msg)
        return

    def ack_get_din(self):
        """
        Inquiry the DIN Parameter Command “0x8A” --- RTU 应答 查询 DIN 参数命令
        Upstream Structure: A5 L1 L2 8A TP1 TP2 CP1 CP2 ID1~15 Cnt Index Type confirmTime 24hr startValue interval total
            Index Type confirmTime 24hr SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        Cnt         1B      Total quantity group of the Data (Each Group=Index~24hr)
        Index       1B      Index is Channel Number of the DIN, Index=0~8
        Type        1B      0 =Disable; 1=NO; 2=NC; 3=Change; 4=Disarm/arm; 5=Counter
        confirmTime 2B      Alarm Verify Time (Integer),Max: 9999
        24hr        1B      24*7hours arm, cannot be disarm,Enable=1;Disable=0
        startValue  4B      Start Value(Integer),Max: 999999 ,If “Type” ≠5,then this value is invalid
                            当 type 为 5 时传输此值，否则不传（下同）
        interval    4B      Step Alarm Value (Integer),Max:999999, If “Type” ≠5,then this value is invalid.
        total       4B      Total Alarm Value(Integer)，Max:999999, If “Type” ≠5,then this value is invalid.
        :return: list of din parameter
            [{'index': int, 'type': int, 'confirmTime': int, 'hour24': int, 'startVal': int, 'interval': int,
            'total': int}]
        """
        self.parse_device_id()
        din_param = []
        p = DATA_BEGIN
        cnt, = struct.unpack("<B", self.ori_rx[p:p + 1])
        p += 1
        for i in xrange(cnt):
            index, din_type, confirm, hr24, = struct.unpack("<BBHb", self.ori_rx[p:p + 5])
            p += 5
            start_val, interval, total = None, None, None
            if din_type == 5:
                start_val, interval, total = struct.unpack("<III", self.ori_rx[p:p + 12])
                p += 12
            din_param.append({'index': index, 'type': din_type, 'confirmTime': confirm, 'hour24': hr24,
                              'startVal': start_val, 'interval': interval, 'total': total})
        return din_param

    def set_inter_lock(self, param):
        """
        Program the Inter-Lock Command 0x8B （Downstream ） 发起方：服务器，设置触发事件命令
        Tips: When to program the Inter-Lock of the 27X, need to send 40 Events in the same data package, “0” means
        the event is invalid, when inquiry the Inter-Lock Command, will Upstream all of the Events.
        27X 系列 RTU 设备最多存储四十个触发事件配置，而且在调用本命令进行配置时，须将所有 40 组事件同时
        送给设备，未设置的使用 0 填充；
        若要针对设备已有事件进行修改，服务器须先调用 0x8C 先读取设备上的四十个事件配置，再进行设置。
        Downstream Structure:A5 L1 L2 8B TP1 TP2 CP1 CP2 Cnt Event Active Event Active Event Active … SUM1 SUM2
            A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Cnt         1B      Total quantity group of the Data (Each Group=Event ~ Active)
        Event       1B      Event=0~54 (Refer to the “ Inter-Lock Code Table ” )
        Active      1B      Active=0~18 (Refer to the “ Inter-Lock Code Table ” )

        =================== Inter-Lock Code Table ===================
        Event Code          Description
        ---------------     ------------------------------------------------------------
        0                   None
        1                   Arm
        2                   Disarm
        4~11                DIN1 ~ DIN8 Alarm   DIN1~DIN8 报警
        13~20               DIN1 ~ DIN8 Recovery    DIN1~DIN8 恢复
        21                  Step Alarm Value    间隔报警
        22                  Total Value Alarm   总值报警
        24~29               AIN1~AIN6 Alarm
        31~36               AIN1~AIN6 Recovery
        37                  Temperature Alarm
        38                  Humidity Alarm
        39                  Temperature Recovery
        40                  Humidity Recovery
        41                  All the Relay Close 所有继电器闭合
        42~45               Relay 1~ Relay 4 Close
        46                  All the Relay Open  所有继电器断开
        47~50               Relay 1~ Relay 4 Open
        51                  RS232 Device Alarm
        52                  RS485 Device Alarm
        53                  GSM Signal Low
        54                  GPRS Connection Failure

        Action Code         Description
        ---------------     ------------------------------------------------------------
        0                   None
        1                   Reset
        2                   All the Relay Close
        3                   All the Relay Open
        4                   Relay 0 Open
        5                   Relay 0 Close
        6                   Relay 1 Open
        7                   Relay 1 Close
        8                   Relay 2 Open
        9                   Relay 2 Close
        10                  Relay 3 Open
        11                  Relay 3 Close
        12                  Arm 布防
        13                  Disarm  撤防
        14                  GPRS Online
        15                  Open the Door   开门
        16                  Siren   警号
        17                  Video-Interlock
        18                  Switch ON/OFF   开关

        :param param:
        :return: list of inter-lock parameter
            [{'event': int, 'action': int}]
        """
        cnt = 40
        data = struct.pack('<B', cnt)
        n = 0
        for o in param:
            data += struct.pack('<BB', o['event'], o['action'])
            n += 1

        while n < 40:
            data += struct.pack('<BB', 0, 0)
            n += 1

        msg = self.generate_send_msg(cmd=0x8B, data=data)
        self.send_msg(msg)
        return

    def ack_set_inter_lock(self):
        """
        设置触发事件命令  0x8B （上行）
        Upstream Structure:A5 L1 L2 8B TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        code        1       1 = success, 0 = error. 响应码
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("<b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'ack set inter lock: success = {}'.format(success)
        return

    def get_inter_lock(self):
        """
        Inquiry the Inter-Lock Command “0x8C” （Downstream ）
        Downstream Structure: A5 L1 L2 8C TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x8C)
        self.send_msg(msg)
        return

    def ack_get_inter_lock(self):
        """
        Inquiry the Inter-Lock Command “0x8C” （Upstream ） --- RTU 应答 查询 关联事件命令
        Upstream Structure: A5 L1 L2 8C TP1 TP2 CP1 CP2 ID1~15 Cnt Event Active Event Active Event Active … SUM1 SUM2
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        Cnt         1B      Total quantity group of the Data (Each Group=Event ~ Active)
        Event       1B      Event=0~54 (Refer to the “ Inter-Lock Code Table ” )
        Active      1B      Active=0~18 (Refer to the “ Inter-Lock Code Table ” )
        :return:  list of inter-lock configuration
            [{'event': int, 'action': int}]
        """
        self.parse_device_id()
        inter_lock = []
        p = DATA_BEGIN
        cnt, = struct.unpack("<B", self.ori_rx[p:p + 1])
        p += 1
        for i in xrange(cnt):
            event, action = struct.unpack("<BB", self.ori_rx[p:p + 2])
            p += 2
            inter_lock.append({'event': event, 'action': action})
        return inter_lock

    def set_timed_task(self, param):
        """
        Program the Timer Inter-Lock Command “0x8D” （Downstream ）
        Tips: When to program the Inter-Lock of the 27X, need to send 10 Timer Inter-Lock Events in the same data
        package, “0” means the event is invalid, when inquiry the Inter-Lock Command, will Upstream all of the Events.
        27X 系列 RTU 设备最多存储十个定时任务配置，而且在调用本命令进行配置时，须将所有 10 组定时任务同
        时送给设备，未设置的使用 0 填充；
        若要针对设备已有定时任务进行修改，服务器须先调用 0x8E 先读取设备上的十组定时任务配置，再进行设置。
        Downstream Structure: A5 L1 L2 8D TP1 TP2 CP1 CP2 Cnt week hour min Event week hour min Event … SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Cnt         1B      Cnt =10, Total quantity group of the Data (Each Group= Week ~ Event)
        week        1B      When “Bit7” =1 is enable this Timer Inter-Lock, When “Bit7” =0 is disable
                            this Timer Inter-Lock. Bit0~Bit6 is Week: 0~6=Sunday~ Saturday; 7=Everyday
        hour        1B      Hour=0~24
        Min         1B      Min=0~60
        Event       1B      Event=0~18 (Refer to the “Timer Inter-Lock Code Table”)

        =================== Timer Inter-Lock Code Table ===================
        Event Code  Description
        ----------  -----------------------------------------------------------
        0           Reboot
        1           GPRS Upload Data
        2           Pulse Counter Reset to Zero
        3           Auto Report By SMS
        4           GPRS Online
        5           Collect the Data By RS232/485
        6           Save the Historical Data
        7           All the Relay Close
        8           All the Relay Open
        9~12        Relay 1~4 Close
        13~16       Relay 1~4 Open
        17          Arm
        18          Disarm
        ================================================================================
        For Example ：
        Example 1: (Program to enable the 1st Timer ,GPRS upload the data in Everyday 08:05; enable the 10th Timer,
        Save the Historical Data in Every Tuesday 10:30)
        Server Downstream:
        A5 2E 00 8D 01 00 01 00 0A 87 08 05 01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
        00 00 00 00 00 00 00 00 82 0A 1E 06 F3 FD A5
        [{'no': 1, 'valid': 1, 'week': 7, 'hour': 8, 'minute': 5, 'event': 1},
         {'no': 10, 'valid': 1, 'week': 2, 'hour': 10, 'minute': 30, 'event': 6}]
        :param param: list of timed task parameter
            [{'no': int, 'valid': int, 'week': int, 'hour':int, 'minute': int, 'event': int}]
        :return:
        """
        cnt = 10
        data = struct.pack('<B', cnt)
        pm = copy.deepcopy(param)
        pm.sort(key=take_no)
        p = 0
        for i in xrange(cnt):
            o = pm[p]
            if i == o['no'] - 1:
                if o['valid'] == 0:
                    data += struct.pack('<BBbb', 0, 0, 0, 0)
                else:
                    week = (o['valid'] << 7) | o['week']
                    data += struct.pack('<BBbb', week, o['hour'], o['minute'], o['event'])
                p += 1
            else:
                data += struct.pack('<BBbb', 0, 0, 0, 0)
        msg = self.generate_send_msg(cmd=0x8D, data=data)
        self.send_msg(msg)
        return

    def ack_set_timed_task(self):
        """
        Program the Timer Inter-Lock Command “0x8D” （Upstream ） --- RTU 应答 设置定时任务命令
        Upstream Structure: A5 L1 L2 8D TP1 TP2 CP1 CP2 ID1~15 bool SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        device ID   15      ASCII
        code        1       1 = success, 0 = error. 响应码
        :return:
        """
        self.parse_device_id()
        success, = struct.unpack("<b", self.ori_rx[DATA_BEGIN:DATA_BEGIN + 1])
        print 'ack set timed task: success = {}'.format(success)
        return

    def get_timed_task(self):
        """
        Inquiry the Timer Inter-Lock Command “0x8E” （Downstream ）
        Downstream Structure:A5 L1 L2 8E TP1 TP2 CP1 CP2 SUM1 SUM2 A5
        :return:
        """
        msg = self.generate_send_msg(cmd=0x8E)
        self.send_msg(msg)
        return

    def ack_get_timed_task(self):
        """
        Inquiry the Timer Inter-Lock Command “0x8E”  -- RTU 返回 查询定时任务命令的结果
        Upstream Structure: A5 L1 L2 8D TP1 TP2 CP1 CP2 ID1~15 Cnt week hour min Event week hour min Event …
            SUM1 SUM2 A5
        Character   Bytes   Description
        ---------   ------  ---------------------------------------------------------------------------------
        Device ID   15      ASCII
        Cnt         1B      Cnt =10, Total quantity group of the Data (Each Group= Week ~ Event)
        week        1B      When “Bit7” =1 is enable this Timer Inter-Lock, When “Bit7” =0 is disable
                            this Timer Inter-Lock. Bit0~Bit6 is Week: 0~6=Sunday~ Saturday; 7=Everyday
        hour        1B      Hour=0~24
        Min         1B      Min=0~60
        Event       1B      Event=0~18 (Refer to the “Timer Inter-Lock Code Table”)
        :return: list of timed task parameter
            [{'no': int, 'valid': int, 'week': int, 'hour':int, 'minute': int, 'event': int}]
        """
        self.parse_device_id()
        timed_task = []
        p = DATA_BEGIN
        cnt, = struct.unpack("<B", self.ori_rx[p:p + 1])
        p += 1
        for i in xrange(cnt):
            week, hour, minute, event = struct.unpack("<BBbb", self.ori_rx[p:p + 4])
            p += 4
            valid = (week & 0x80) >> 7
            w = week & 0x7F
            timed_task.append({'no': i+1, 'valid': valid,
                               'week': w, 'hour': hour, 'minute': minute, 'event': event})
        return timed_task

    def parse_device_id(self):
        with app.app_context():
            dev_id, = struct.unpack("<15s", self.ori_rx[DEVICE_BEGIN:DATA_BEGIN])
            if self.device_id is None:
                self.device_id = dev_id
                dev = Device.query.filter_by(device_id=self.device_id).first()
                if dev is None:
                    dev = Device({'deviceId': dev_id, 'isOnline': 1, 'name': 'RTU'})
                    db.session.add(dev)
                    db.session.commit()
            if self.device_id != dev_id:
                self.handle.server.del_device_client(self.device_id)
                dev = Device.query.filter_by(device_id=self.device_id).first()
                if dev is not None:
                    dev.update({'deviceId': dev_id})
                    db.session.commit()
                self.device_id = dev_id
            self.handle.server.add_device_client(dev_id, self)
            print 'device id = {}'.format(dev_id)
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

    def generate_send_msg(self, cmd=None, length=None, tp=1, cp=1, data=None):
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
        length = MSG_HEAD_LENGTH + (0 if data is None else len(data)) if length is None else length
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
                    "bit28~31" is the Type,1=NC, 2=NO, 3=Change, 5=Counter
                    When the "bit28~31" =1,2,3; then Data =1=Open; Data =0= Close;
                    When the "bit28~31" =5, then it will use as a Counter, the data is the specific value;
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


kp_server = WmmServer(9999)       # king pigeon server

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
