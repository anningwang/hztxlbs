#!flask/bin/python
# -*- coding:utf-8 -*-
from app import app, socketio
from app.utils.wmmtools import WmmTools
from app.utils.tcpserver import kp_server


if __name__ == '__main__':
    ip = WmmTools.get_ip()
    print("Ip=%s" % ip)

    kp_server.run()

    # app.run(host=ip, port=80, debug=True, use_reloader=False, threaded=True)
    socketio.run(app, host=ip, port=8300, debug=True, use_reloader=False)
