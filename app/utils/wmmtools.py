# -*- coding:utf-8 -*-
__author__ = 'WangXiuGuo'

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
