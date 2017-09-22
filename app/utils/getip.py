import platform
import socket


def get_ip():
    if is_windows_os():
        hostname = socket.gethostname()
        ip = socket.gethostbyname(hostname)
    else:
        ip = '0.0.0.0'
    return ip


def is_windows_os():
    return 'Windows' in platform.system()
