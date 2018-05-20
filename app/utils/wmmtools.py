# -*- coding:utf-8 -*-
__author__ = 'WangXiuGuo'
__version__ = '0.1'

from ctypes import *
import struct
import platform
import socket


class WmmTools(object):
    def __init__(self):
        pass

    @staticmethod
    def convert_float(s):
        i = int(s, 16)                   # convert from hex to a Python int
        cp = pointer(c_int(i))           # make this into a c integer
        fp = cast(cp, POINTER(c_float))  # cast the int pointer to a float pointer
        return fp.contents.value         # dereference the pointer, get the float

    @staticmethod
    def to_hex(f):
        h = struct.pack("<f", f).encode('hex')  # float value to hex
        return h.upper()

    @staticmethod
    def to_float(s):
        f = struct.unpack('!f', s.decode('hex'))[0]   # hex string to float
        return f

    @staticmethod
    def get_ip():
        if WmmTools.is_windows_os():
            hostname = socket.gethostname()
            ip = socket.gethostbyname(hostname)
        else:
            ip = '0.0.0.0'
        return ip

    @staticmethod
    def is_windows_os():
        return 'Windows' in platform.system()

    # 将16进制数据转换为字节流 data: A5 05 00 94 01 00 01 00 64 FF A5 or A50500940100010064FFA5
    @staticmethod
    def data_switch(data):
        ret = ''
        data = data.strip()
        while data:
            tmp = data[0:2]
            s = int(tmp, 16)
            ret += struct.pack('B', s)
            data = data[2:].strip()
        return ret

    @staticmethod
    def format_data(data):
        ret = ''
        data = data.strip()
        while data:
            tmp = data[0:2]
            ret += tmp + ' '
            data = data[2:].strip()
        return ret
