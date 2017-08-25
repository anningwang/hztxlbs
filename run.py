#!flask/bin/python
# -*- coding:utf-8 -*-
from app import app, socketio

import socket
hostname = socket.gethostname()
ip = socket.gethostbyname(hostname)

# app.run(debug=True)
if __name__ == '__main__':
    # app.run(host=ip, port=80, debug=True, use_reloader=False, threaded=True)
    socketio.run(app, host=ip, port=80, debug=True, use_reloader=False)
