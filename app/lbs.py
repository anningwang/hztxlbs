# -*- coding:utf-8 -*-
from apscheduler.schedulers.background import BackgroundScheduler     # Apscheduler ver 3.3.1
import datetime
import urllib2
import json
from models import HzToken, HzLocation
from app import db, socketio, app
from flask import request
from flask_socketio import emit, join_room, close_room
import copy
from threading import Lock
import dijkstra
import random
import logging
from utils.getip import is_windows_os
from hzlbs.hzglobal import HZ_ACCESS_TOKEN, HZ_UID, TEST_UID


log = logging.getLogger('apscheduler.executors.default')
log.setLevel(logging.WARNING)

fmt = logging.Formatter('%(levelname)s:%(name)s:%(message)s')
h = logging.StreamHandler()
h.setFormatter(fmt)
log.addHandler(h)

HZ_LICENSE = "cb5537fd8e684827b7e4f83b742c8f2c"
JOB_INTERVAL = 60 * 10                  # seconds
CUR_MAP_SCALE = 0.3                     # 当前屏幕地图缩放比例 30%
HZ_MAP_GEO_WIDTH = 39023.569023569024   # 毫米
HZ_MAP_GEO_HEIGHT = 19854.09652076319
# [{"name":"Floor3","mapImage":"Floor3.jpg","mapImageWidth":3477,"mapImageHeight":1769,"geoScale":{"x":89.1,"y":89.1}}]
HZ_TEST_ADD_POS = False                 # 为真，则向数据库随机插入坐标点
HZ_TEST_DEBUG = False                   # 为真，不从 LBS 引擎获取数据，从数据库刷新位置
hz_uid_map = {}                         # 保存 uid 对应的最新坐标 { 'userId': [x,y], '1918E00103AA': [100, 200] }
hz_uid_old_map = {}
hz_client_id = {}                       # 在线客户表
""" 
{'sid': {'navigating': 0,'location': 27, 'userId': '1918E00103AA'}}
navigating  --  是否开启导航 0, 否; 1, 是
location    --  导航的目的地 点编号 23,24, ..., 34
    23 -- 会议室
    24 -- 副总办公室1
    25 -- 副总办公室2
    26 -- 仓库
    27 -- Room 1 测试区
    28 -- 总裁办公室
    29 -- Room 2
    30 -- Room 3
    31 -- Room 4 健身房
    32 -- Room 5
    33 -- Room 6
    34 -- 7 演示厅
userId      --  用户ID
"""

HZ_NAMESPACE = '/HeZhong'
thread = None
thread_lock = Lock()
hz_apscheduler = None
hz_apscheduler_lock = Lock()

HZ_MSG_INVALID_ACCESS_TOKEN = 1060000   # Invalid AccessToken


def hz_get_new_pos():
    """
    查询 每个ID对应的最新坐标
    :return:
    """
    hz_location = HzLocation.query.group_by(HzLocation.user_id)
    for loc in hz_location:  # 如果存在，则获取最新的一个坐标
        hz_uid_map[loc.user_id] = [loc.x, loc.y]
    return hz_uid_map


def job_get_token():
    if HZ_TEST_DEBUG:
        print '+++---+++ test mode, pass get token.'
        return
    elif is_windows_os():
        return

    time_now = datetime.datetime.utcnow()
    hz_token = HzToken.query.all()
    if len(hz_token) > 0 and (time_now - hz_token[0].timestamp).total_seconds() < hz_token[0].expires_in - JOB_INTERVAL:
        return

    test_data = {"licence": HZ_LICENSE}
    url = "https://api.joysuch.com:46000/getAccessTokenV2"

    # refresh access token
    if len(hz_token) > 0 and (time_now - hz_token[0].timestamp).total_seconds() < hz_token[0].expires_in:
        url = "https://api.joysuch.com:46000/refreshAccessToken"
        test_data = {"refreshToken": hz_token[0].refresh_token}

    data = json.dumps(test_data)
    headers = {'Content-Type': 'application/json;charset=UTF-8',
               'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:23.0) Gecko/20100101 Firefox/23.0'}
    req = urllib2.Request(url=url, data=data, headers=headers)
    res_data = urllib2.urlopen(req)
    res = res_data.read()
    obj = json.loads(res)
    if obj['errorCode'] == 0:
        if len(hz_token) == 0:      # 还没有获取过token
            my_token = HzToken(license=HZ_LICENSE,
                               token=obj['data']['token'],
                               refresh_token=obj['data']['refreshToken'],
                               expires_in=obj['data']['expiresIn'],
                               timestamp=datetime.datetime.utcnow())
            db.session.add(my_token)
            db.session.commit()
        else:           # 更新token
            hz_token[0].token = obj['data']['token']
            hz_token[0].refresh_token = obj['data']['refreshToken']
            hz_token[0].expires_in = obj['data']['expiresIn']
            hz_token[0].timestamp = time_now
            print "Update token:", hz_token[0], "at", time_now, "[END]"
            db.session.add(hz_token[0])
            db.session.commit()
    elif obj['errorCode'] == HZ_MSG_INVALID_ACCESS_TOKEN:
        hz_token[0].expires_in = 0
    else:
        print "error in function job_get_token(): ", res
        print "url= ", url
        print "req data= ", test_data


def job_get_location():

    with app.app_context():
        if HZ_TEST_DEBUG:
            hz_test_refresh_location()
            return

        time_now = datetime.datetime.utcnow()
        hz_token = HzToken.query.all()

        if not is_windows_os():
            # 还没有获取过token，或者token过期
            if len(hz_token) == 0 or (time_now - hz_token[0].timestamp).total_seconds() > hz_token[0].expires_in:
                return
            token = hz_token[0].token
            url = "https://api.joysuch.com:46000/WebLocate/locateResults"
        else:
            token = HZ_ACCESS_TOKEN
            url = "http://120.78.81.125:8300/api/hz_lbs/WebLocate/locateResults"

        data = {'accessToken': token,
                'userIds': HZ_UID,
                'timePeriod': 3000}
        headers = {'Content-Type': 'application/json;charset=UTF-8',
                   'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; WOW64; rv:23.0) Gecko/20100101 Firefox/23.0'}
        req = urllib2.Request(url=url, data=json.dumps(data), headers=headers)
        res_data = urllib2.urlopen(req)
        res = res_data.read()
        obj = json.loads(res)
        if obj["errorCode"] == 0:
            # 测试代码。向数据库随机插入坐标点
            if HZ_TEST_ADD_POS:
                test_loc = HzLocation(build_id='', floor_no='', user_id=TEST_UID,
                                      x=random.randint(20, int(HZ_MAP_GEO_WIDTH)-1000),
                                      y=random.randint(20, int(HZ_MAP_GEO_HEIGHT)-1000),
                                      timestamp=datetime.datetime.today())
                db.session.add(test_loc)
                db.session.commit()

            # pos_to_client = []
            if len(hz_uid_map) == 0:
                hz_get_new_pos()
            for item in obj["data"]:
                uid = item['userId']
                x = item["xMillimeter"]
                y = item["yMillimeter"]
                if uid in hz_uid_map and hz_uid_map[uid][0] == x and hz_uid_map[uid][1] == y:
                    # print "重复数据the same data: x=", x, " y=", y, " uid=", uid
                    continue

                hz_location = HzLocation(build_id=item["buildId"],
                                         floor_no=item["floorNo"],
                                         user_id=item["userId"],
                                         x=item["xMillimeter"],
                                         y=item["yMillimeter"],
                                         timestamp=datetime.datetime.today())
                db.session.add(hz_location)
                db.session.commit()
                hz_uid_map[uid] = [x, y]
                # pos_to_client.append({'userId': uid, 'x': x, 'y': y})
            # if len(hz_client_id) > 0 and len(pos_to_client) > 0:
                # print 'Notify position to client.', pos_to_client
                # socketio.emit('hz_position', pos_to_client, namespace=HZ_NAMESPACE)
        elif obj['errorCode'] == HZ_MSG_INVALID_ACCESS_TOKEN:
            if not is_windows_os():
                hz_token[0].expires_in = 0
                db.session.add(hz_token[0])
                db.session.commit()
            print 'token error!'
        else:
            print "error in function job_get_location(): ", res
            print "url= ", url
            print "req data= ", data


scheduler = BackgroundScheduler()
with hz_apscheduler_lock:
    if hz_apscheduler is None:
        scheduler.add_job(job_get_token, 'interval', seconds=JOB_INTERVAL, id='my_job_get_token',
                          next_run_time=datetime.datetime.now())
        scheduler.add_job(job_get_location, 'interval', seconds=2, id='my_job_get_location',
                          next_run_time=datetime.datetime.now() + datetime.timedelta(seconds=2))
        scheduler.start()


def hz_test_refresh_location():
    hz_location = HzLocation.query.group_by(HzLocation.user_id).all()
    for loc in hz_location:  # 如果存在，则获取最新的一个坐标
        hz_uid_map[loc.user_id] = [loc.x, loc.y]
    return hz_uid_map


# 获取用户位置
def hz_get_pos():
    if len(hz_uid_map) == 0:
        hz_get_new_pos()
    pos_to_client = []
    for uid in hz_uid_map:
        pos_to_client.append({'userId': uid, 'x': hz_uid_map[uid][0], 'y': hz_uid_map[uid][1]})

    return pos_to_client


def hz_get_changed_pos():
    """
    获取和上次有变化的用户位置
    :return:  位置有变化的用户列表, list [{'userId': '1918E00103AA', 'x': 7000, 'y': 2000}, {...}, ...]
    """
    global hz_uid_old_map

    if len(hz_uid_map) == 0:
        return hz_get_pos()

    if hz_uid_map == hz_uid_old_map:
        return []
    pos = []
    for n in hz_uid_map:
        same = False
        for o in hz_uid_old_map:
            if hz_uid_map[n] == hz_uid_old_map[o]:
                same = True
                break
        if not same:
            pos.append({'userId': n, 'x': hz_uid_map[n][0], 'y': hz_uid_map[n][1]})

    hz_uid_old_map = copy.deepcopy(hz_uid_map)
    return pos


@socketio.on('connect', namespace=HZ_NAMESPACE)
def hz_connect():
    emit('hz_response', {'data': 'Connected', 'count': 0})
    print request.sid, "is connected!"
    hz_client_id[request.sid] = {'navigating': 0}
    join_room(request.sid)

    pos_to_client = hz_get_pos()
    if len(pos_to_client) > 0:
        emit('hz_position', pos_to_client)

    global thread
    with thread_lock:
        if thread is None:
            thread = socketio.start_background_task(target=background_thread)


@socketio.on('hz_get_position', namespace=HZ_NAMESPACE)
def hz_get_position():
    pos_to_client = hz_get_pos()
    if len(pos_to_client) > 0:
        emit('hz_position', pos_to_client)


@socketio.on('disconnect', namespace=HZ_NAMESPACE)
def hz_disconnect():
    print('Client disconnected', request.sid)
    close_room(request.sid)
    del hz_client_id[request.sid]


@socketio.on('hz_navigating', namespace=HZ_NAMESPACE)
def hz_navigating(message):
    hz_client_id[request.sid]['location'] = message['location']
    hz_client_id[request.sid]['userId'] = message['userId']
    hz_client_id[request.sid]['navigating'] = 1
    # print hz_client_id
    path = hz_get_path(hz_client_id[request.sid]['location'], hz_client_id[request.sid]['userId'])
    hz_client_id[request.sid]['path_cmp'] = path
    emit('hz_path',
         path,
         namespace=HZ_NAMESPACE,)


@socketio.on('hz_stop_navigating', namespace=HZ_NAMESPACE)
def hz_stop_navigating():
    hz_client_id[request.sid]['navigating'] = 0


@socketio.on_error(namespace=HZ_NAMESPACE)
def hz_error_handler(e):
    print('An error has occurred: ' + str(e))


def hz_get_path(location, user_id):
    px = hz_uid_map[user_id][0]
    py = hz_uid_map[user_id][1]

    pt_from = dijkstra.get_nearest_vertex(px, py)
    path = dijkstra.min_dist2(pt_from, location)
    # print path

    ret = []
    for p in path:
        ret.append(dijkstra.hz_vertex[p])

    return {'userId': user_id, 'x': px, 'y': py, 'path': ret}


def background_thread():
    """Example of how to send server generated events to clients."""
    from app.hzlbs.elecrail import hz_lbs_elect_rail

    count = 0
    # hz_tk = {}
    while True:
        socketio.sleep(1)
        count += 1

        # socketio.emit('hz_response',
        #              {'data': 'Server generated event', 'count': count},
        #              namespace='/HeZhong')

        pos_to_client = hz_get_changed_pos()
        if len(pos_to_client) > 0:
            socketio.emit('hz_position', pos_to_client, namespace=HZ_NAMESPACE)

        data = hz_get_pos()
        with app.app_context():
            rail_info = hz_lbs_elect_rail(data)    # 判断是否进入/退出 电子围栏
            if len(rail_info) != 0:
                socketio.emit('hz_electronic_tail', rail_info, namespace=HZ_NAMESPACE)

        for client in hz_client_id:
            if hz_client_id[client]['navigating'] == 1:
                path = hz_get_path(hz_client_id[client]['location'], hz_client_id[client]['userId'])
                if path == hz_client_id[client]['path_cmp']:
                    continue

                hz_client_id[client]['path_cmp'] = path
                socketio.emit('hz_path', path, namespace=HZ_NAMESPACE, room=client)
