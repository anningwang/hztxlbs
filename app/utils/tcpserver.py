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

    """
    def close_request(self, request):
        # Called to clean up an individual request.
        print request, 'will be close!'
        self.del_client(request)
        request.close()
"""

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

            self.protocol.data_received(data)

            # print "{} wrote:".format(self.client_address[0])
            # print data

            cur_thread = threading.current_thread()
            print 'thread:{} receive data from {}, {}'.format(cur_thread.name, self.client_address[0],
                                                              self.client_address[1])
            # response = "{}: {}".format(cur_thread.name, self.protocol.hex_rx)

            # just send back the same data, but upper-cased
            # self.request.sendall(response)

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
        self.time_out_val = 60
        self.time_out_cnt = 0
        self.time_out_tick = 0
        self.tick = 0

        self.random = None

        self.dispatch = {
            0x80: self.ack_random_number,
            0x94: self.ack_inquiry_device_id,
            0x97: self.ack_inquiry_device_id,
            0x99: self.ack_control_relay
        }

        self.timer_func = [
            # --- cnt, period, function ---
            [59, 60, self.ontimer_keep_alive]
        ]

    def __del__(self):
        self.close_timer()

    def get_device_id(self):
        return self.device_id

    def data_received(self, data):
        self.ori_rx = data
        self.hex_rx = data.encode('hex').upper()

        self.handle.request.sendall(self.hex_rx)
        self.time_out_tick = 0
        self.time_out_cnt = 0

        try:
            start, l, cmd, tp, cp = struct.unpack("<BhBhh", data[0:DEVICE_BEGIN])
            self.length = l
            self.cmd = cmd
            self.tp = tp
            self.cp = cp
            if start != self.start:
                print data
                print 'error: Receive data is not king pigeon protocol.'
                return
            print WmmTools.format_data(self.hex_rx)
            print 'cmd=0x{:X}'.format(cmd)
            if cmd in self.dispatch:
                apply(self.dispatch[cmd])
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
        self.hex_tx = data.encode('hex').upper()
        self.calc_sum()
        print 'tx=', self.hex_tx
        self.handle.request.sendall(self.ori_tx)
        return

    def time_out(self):
        self.time_out_cnt += 1
        self.time_out_tick = 0
        print 'time out {}, {}, cnt={}'.format(self.host, self.port, self.time_out_cnt)
        if self.time_out_cnt >= 3:
            self.handle.server.shutdown_request(self.handle.request)
            return True
        return False

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

        # self.random = [0x12, 0x34, 0x56, 0x78]
        print self.verify_random(calc)
        return

    def ack_control_relay(self):
        self.parse_device_id()
        success, = struct.unpack("b", self.ori_rx[DATA_BEGIN:DATA_BEGIN+1])
        print 'success=', success

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

    def calc_sum(self):
        # 2B (LSB First, Sum Negation，from “Length” to “SUM”)
        # Tips: Sum is the origin Sum, not after Escape String.
        data = self.ori_tx
        s = 0
        for i in range(1, len(data)):
            c, = struct.unpack("B", data[i:i+1])
            s += c
        self.sum = ~s
        self.ori_tx += struct.pack('<hB', self.sum, self.end)
        self.hex_tx = self.ori_tx.encode('hex').upper()
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
