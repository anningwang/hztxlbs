#!flask/bin/python
# -*- coding:utf-8 -*-
from app import app, socketio
from app.utils.getip import get_ip


if __name__ == '__main__':
    ip = get_ip()
    # app.run(host=ip, port=80, debug=True, use_reloader=False, threaded=True)
    socketio.run(app, host=ip, port=8300, debug=True, use_reloader=False)
