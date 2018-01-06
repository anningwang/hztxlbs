
# coding=utf-8
from hzglobal import *
from app.models import HzElecTail, db, HzElecTailCfg, HzEtPoints
import datetime


""" 以下为 屏幕像素坐标，转换为 实际地理坐标需要 除以 GEO_SCALE """
HZ_ROOM1 = [{'x': 2265, 'y': 135}, {'x': 2265, 'y': 439}, {'x': 2502, 'y': 439}, {'x': 2502, 'y': 135}]
HZ_ROOM4 = [{'x': 2971, 'y': 135}, {'x': 2971, 'y': 439}, {'x': 3293, 'y': 439}, {'x': 3293, 'y': 135}]

HZ_ROOM1_NAME = u'room1'
HZ_ROOM4_NAME = u'room4'
HZ_ROOM1_GEO = []
HZ_ROOM4_GEO = []
HZ_RAIL_LIST = [HZ_ROOM1_GEO, HZ_ROOM4_GEO]
HZ_RAIL_NO_LIST = [HZ_ROOM1_NAME, HZ_ROOM4_NAME]


HZ_ELEC_RAIL = {}   # 电子围栏 'userId' : 'roomName': '1918E00103AA': 'room1'


def screen2geo():
    """  将屏幕坐标转换为 实际地理 坐标 """
    for item in HZ_ROOM1:
        HZ_ROOM1_GEO.append({'x': item['x'] / GEO_SCALE, 'y': item['y'] / GEO_SCALE})

    for item in HZ_ROOM4:
        HZ_ROOM4_GEO.append({'x': item['x'] / GEO_SCALE, 'y': item['y'] / GEO_SCALE})


screen2geo()


def get_elecrail():
    """ 获取电子围栏配置 """
    return [{'name': HZ_ROOM1_NAME, 'points': HZ_ROOM1_GEO}, {'name': HZ_ROOM4_NAME, 'points': HZ_ROOM4_GEO}]


def pnpoly_c(nvert, vertx, verty, testx, testy):
    """ 射线法，判断 点 (testx, testy)是否在不规则图形内"""
    c = 0
    j = nvert-1
    for i in range(nvert):
        if (((verty[i] > testy) != (verty[j] > testy)) and
                (testx < (vertx[j]-vertx[i]) * (testy-verty[i]) / (verty[j]-verty[i]) + vertx[i])):
            c = not c
        j = i

    return c


def pnpoly(poly, x, y):
    """ 射线法，判断 点 (x, y)是否在不规则图形内"""
    if not pt_in_ploy(poly, x, y):
        return False

    n = len(poly)
    c = False
    j = n-1
    for i in range(n):
        if (((poly[i]['y'] > y) != (poly[j]['y'] > y)) and
                (x < (poly[j]['x']-poly[i]['x']) * (y - poly[i]['y']) / (poly[j]['y']-poly[i]['y']) + poly[i]['x'])):
            c = not c
        j = i

    return c


def pt_in_ploy(poly, x, y):
    """ 判断 点(x,y) 是否 在 poly 最大和最小坐标之外，粗略 判断点是否在图形之内 """
    n = len(poly)
    if n < 3:
        return False

    xmax = xmin = poly[0]['x']
    ymax = ymin = poly[0]['y']

    for i in range(1, n):
        if poly[i]['x'] > xmax:
            xmax = poly[i]['x']
        elif poly[i]['x'] < xmin:
            xmin = poly[i]['x']

        if poly[i]['y'] > ymax:
            ymax = poly[i]['y']
        elif poly[i]['y'] < ymin:
            ymin = poly[i]['y']

    if x < xmin or x > xmax or y < ymin or y > ymax:
        return False

    return True


def hz_lbs_elect_rail(userlist):
    """
    判断用户是否 进入 或者 退出 电子围栏。每次产生记录都会写入数据库
    :param userlist:    list [{'userId': '1918E00103AA', 'x': 7000, 'y': 2000}, ...]
    :return:
    """

    ret = []

    tm = datetime.datetime.today()
    tm_str = datetime.datetime.strftime(tm, '%Y-%m-%d %H:%M:%S')

    er_dict = get_er_data()
    for usr in userlist:
        i = 0
        for rail in HZ_RAIL_LIST:
            rec = HzElecTail.query.filter_by(user_id=usr['userId']).filter_by(rail_no=HZ_RAIL_NO_LIST[i])\
                .order_by(HzElecTail.timestamp.desc()).first()
            if pnpoly(rail, usr['x'], usr['y']):    # in room
                if rec is None or rec.status == 0:  # 用户原来不在 围栏内
                    enter = 1
                    new_r = HzElecTail(build_id=HZ_BUILDING_ID, floor_no=HZ_FLOOR_NO, user_id=usr['userId'],
                                       x=usr['x'], y=usr['y'], timestamp=datetime.datetime.today(),
                                       status=enter, rail_no=HZ_RAIL_NO_LIST[i])
                    ret.append({'name': HZ_RAIL_NO_LIST[i], 'status': enter, 'userId': usr['userId'],
                                'datetime': tm_str})
                    print ret
                    db.session.add(new_r)
                    db.session.commit()
            else:  # not in room
                if rec is not None and rec.status == 1:     # 用户原来在 围栏内
                    leave = 0
                    new_r = HzElecTail(build_id=HZ_BUILDING_ID, floor_no=HZ_FLOOR_NO, user_id=usr['userId'],
                                       x=usr['x'], y=usr['y'], timestamp=datetime.datetime.today(),
                                       status=leave, rail_no=HZ_RAIL_NO_LIST[i])
                    ret.append({'name': HZ_RAIL_NO_LIST[i], 'status': leave, 'userId': usr['userId'],
                                'datetime': tm_str})
                    print ret
                    db.session.add(new_r)
                    db.session.commit()
            i += 1

        for rail in er_dict:
            name = rail
            rec = HzElecTail.query.filter_by(user_id=usr['userId']).filter_by(rail_no=name)\
                .order_by(HzElecTail.timestamp.desc()).first()
            if pnpoly(er_dict[name]['points'], usr['x'], usr['y']):    # in room
                if rec is None or rec.status == 0:  # 用户原来不在 围栏内
                    enter = 1
                    new_r = HzElecTail(build_id=HZ_BUILDING_ID, floor_no=HZ_FLOOR_NO, user_id=usr['userId'],
                                       x=usr['x'], y=usr['y'], timestamp=datetime.datetime.today(),
                                       status=enter, rail_no=name)
                    ret.append({'name': name, 'status': enter, 'userId': usr['userId'],
                                'datetime': tm_str})
                    print ret
                    db.session.add(new_r)
                    db.session.commit()
            else:  # not in room
                if rec is not None and rec.status == 1:     # 用户原来在 围栏内
                    leave = 0
                    new_r = HzElecTail(build_id=HZ_BUILDING_ID, floor_no=HZ_FLOOR_NO, user_id=usr['userId'],
                                       x=usr['x'], y=usr['y'], timestamp=datetime.datetime.today(),
                                       status=leave, rail_no=name)
                    ret.append({'name': name, 'status': leave, 'userId': usr['userId'],
                                'datetime': tm_str})
                    print ret
                    db.session.add(new_r)
                    db.session.commit()
    return ret


def get_er_data():
    """
    从数据库获取电子围栏配置
    """
    er_dict = {}
    ers = HzElecTailCfg.query.all()
    for er in ers:
        item = {'id': er.id, 'no': er.rail_no, 'name': er.name}
        pts = HzEtPoints.query.filter_by(et_id=er.id).all()
        points = []
        for pt in pts:
            points.append({'x': pt.x, 'y': pt.y})
        item['points'] = points
        er_dict[er.name] = item
    return er_dict
