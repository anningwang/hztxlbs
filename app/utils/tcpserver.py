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

from wmmtools import WmmTools

BUF_SIZE = 4096         # 从socket每次读取的数据长度
START_CHAR = 0xA5       # 协议开始字符
END_CHAR = 0xA5         # 协议终结字符

DEVICE_BEGIN = 8        # 设备ID开始地址
DATA_BEGIN = 23         # 数据区开始地址

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
            if flag_quit:
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
        self.dispatch = {
            0x70: self.process_alarm,
            0x71: self.upload_data,
            0x80: self.ack_random_number,
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
        self.ori_rx = data
        self.hex_rx = data.encode('hex').upper()
        self.time_out_tick = 0
        self.time_out_cnt = 0

        try:
            start, = struct.unpack("B", data[0:1])
            if start != self.start:
                print 'error: Receive data is not king pigeon protocol. data =', data
                self.send_msg(self.ori_rx.upper())
                return
            l, cmd, tp, cp = struct.unpack("<hBhh", data[1:DEVICE_BEGIN])
            self.length = l
            self.cmd = cmd
            self.tp = tp
            self.cp = cp
            print 'receive data from', self.host, self.port
            print WmmTools.format_data(self.hex_rx)
            print 'cmd=0x{:X}'.format(cmd)
            if cmd in self.dispatch:
                return apply(self.dispatch[cmd])
            else:
                print 'Unknown cmd: 0x{:X}'.format(cmd)
        except struct.error, e:
            print '...exception:', e
            import traceback
            traceback.print_exc()
            print '...error: Receive data is not king pigeon protocol.'

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
        tm = time.time()
        self.generate_random()
        self.cmd = 0x80
        self.length = 13
        data = struct.pack('<BHBHH', self.start, self.length, self.cmd, self.tp, self.cp)
        for i in range(4):
            data += struct.pack('<B', self.random[i])
        data += struct.pack('<I', tm)

        self.ori_tx = data
        sum_tx = self.calc_sum(data)
        self.ori_tx += struct.pack('<hB', sum_tx, self.end)
        self.hex_tx = self.ori_tx.encode('hex').upper()

        print 'tx =', self.hex_tx
        self.send_msg(self.ori_tx)
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
        pass

    def inquiry_current_data(self):
        pass

    def random_number(self):
        pass

    def control_relay(self):
        pass

    def ack_inquiry_device_id(self):
        self.parse_device_id()
        print '...ack inquiry device id: {}'.format(self.device_id)

    def ack_inquiry_current_data(self):
        pass

    def ack_random_number(self):
        self.parse_device_id()
        calc, model, vice_model, version = struct.unpack("<I10s2s6s", self.ori_rx[DATA_BEGIN:DATA_BEGIN+22])
        print calc, model, vice_model, version
        verify = self.verify_random(calc)
        print 'verify=', verify
        return not verify

    def ack_control_relay(self):
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN+1])
        print 'success=', success

    def process_alarm(self):
        self.parse_device_id()
        alm_type, addr, alm = struct.unpack("<BBB", self.ori_rx[DATA_BEGIN:DATA_BEGIN+3])
        print 'type={}, addr={}, alm={}'.format(alm_type, addr, alm)
        tx = self.generate_send_msg(cmd=0x70)
        self.send_msg(tx)
        return

    def upload_data(self):
        self.parse_device_id()
        tx = self.generate_send_msg(cmd=0x71)
        self.send_msg(tx)
        return

    def parse_device_id(self):
        dev_id, = struct.unpack("<15s", self.ori_rx[DEVICE_BEGIN:DATA_BEGIN])
        if self.device_id is None:
            self.device_id = dev_id
        if self.device_id != dev_id:
            self.handle.server.del_device_client(self.device_id)
            self.device_id = dev_id
        self.handle.server.add_device_client(dev_id, self)
        return

    def del_device_protocol(self):
        self.handle.server.del_device_client(self.device_id)

    def generate_random(self):
        self.random = random.sample(range(10, 240), 4)

    def verify_random(self, val):
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
    def calc_sum(data, b=1, e=-1):
        # 2B (LSB First, Sum Negation，from “Length” to “SUM”)
        # Tips: Sum is the origin Sum, not after Escape String.
        s = 0
        data_len = len(data) if e == -1 else len(data[:e])
        for i in range(b, data_len):
            c, = struct.unpack("B", data[i:i+1])
            s += c
        sum_tx = ~s
        return sum_tx

    def generate_send_msg(self, cmd=None, length=5, tp=1, cp=1, device_id=None, data=None):
        cmd = self.cmd if cmd is None else cmd
        if cmd is None:
            return None
        data = struct.pack('<BHBHH', self.start, length, cmd, tp, cp)
        sum_tx = self.calc_sum(data)
        data += struct.pack('<hB', sum_tx, self.end)
        return data

    def send_msg(self, data):
        self.handle.request.sendall(data)


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
