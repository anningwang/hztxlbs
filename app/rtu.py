# -*- coding:utf-8 -*-
from app import socketio
from flask import request
from flask_socketio import emit, join_room, close_room
from app.models import Device
from utils.tcpserver import kp_server
from hzlbs.hzglobal import HZ_NAMESPACE_RTU, hz_rtu_ws_msg, hz_rtu_ws_mutex


hz_rtu_client_id = {}                       # 在线客户表


@socketio.on('connect', namespace=HZ_NAMESPACE_RTU)
def hz_rtu_connect():
    emit('hz_response', {'data': 'Connected', 'count': 0})
    print request.sid, "is connected! ...RTU"
    hz_rtu_client_id[request.sid] = {'navigating': 0}
    join_room(request.sid)


@socketio.on('disconnect', namespace=HZ_NAMESPACE_RTU)
def hz_rtu_disconnect():
    print('Client disconnected', request.sid)
    close_room(request.sid)
    del hz_rtu_client_id[request.sid]


@socketio.on_error(namespace=HZ_NAMESPACE_RTU)
def hz_rtu_error_handler(e):
    print('An error has occurred: ' + str(e))


@socketio.on('hz_rtu_event', namespace=HZ_NAMESPACE_RTU)
def hz_rtu_event(msg):
    print msg


@socketio.on('hz_rtu_arm', namespace=HZ_NAMESPACE_RTU)
def hz_rtu_arm(msg):
    """
    设备布防/撤防
    :param msg:
    {
        'deviceId': 设备id,
        'data':     0 disarm; 2 arm
    }
    :return:
    """
    print 'hz_rtu_arm', msg
    dev = Device.query.get(msg['deviceId'])
    if dev is not None:
        device_id = dev.device_id
        ret = kp_server.server.arm(device_id, msg['data'])
        if ret is not None and 'errorCode' in ret and ret['errorCode'] != 0:
            emit('hz_rtu_error_msg', ret)


@socketio.on('hz_rtu_control_relay', namespace=HZ_NAMESPACE_RTU)
def hz_rtu_control_relay(msg):
    """
    控制继电器命令（开、关继电器）
    :param msg:
    {
        'deviceId': 设备id,
        'data':     [{index: int, op: int}]  -- Index=0~3; op=0~1, 0= Open; 1=Close
    }
    :return:
    """
    dev = Device.query.get(msg['deviceId'])
    if dev is not None:
        device_id = dev.device_id
        ret = kp_server.server.control_relay(device_id, msg['data'])
        if ret is not None and 'errorCode' in ret and ret['errorCode'] != 0:
            emit('hz_rtu_error_msg', ret)


def hz_rtu_send_report(msg):
    socketio.emit('hz_rtu_report', msg, namespace=HZ_NAMESPACE_RTU)


def hz_rtu_background_thread():
    """Example of how to send server generated events to clients."""
    count = 0
    while True:
        socketio.sleep(1)
        count += 1

        for client in list(hz_rtu_client_id.keys()):
            socketio.emit('hz_rtu', 'rtu test', namespace=HZ_NAMESPACE_RTU, room=client)

        ''' 主动上报给web端的设备状态 使用 web socket '''
        hz_rtu_ws_mutex.acquire()
        for msg in hz_rtu_ws_msg:
            hz_rtu_send_report(msg)
        del hz_rtu_ws_msg[:]
        hz_rtu_ws_mutex.release()


hz_rtu_thread = socketio.start_background_task(target=hz_rtu_background_thread)
