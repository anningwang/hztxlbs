#!flask/bin/python
# -*- coding:utf-8 -*-
from app import app, socketio
from app.utils.wmmtools import WmmTools
from app.utils import tcpserver


if __name__ == '__main__':
    ip = WmmTools.get_ip()
    print("ip=%s" % ip)

    server = tcpserver.WmmServer(9999)
    server.run()

    # app.run(host=ip, port=80, debug=True, use_reloader=False, threaded=True)
    socketio.run(app, host=ip, port=8300, debug=True, use_reloader=False)
