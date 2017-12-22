# coding=utf-8

from app import db
from app.models import HzRoomStatCfg, HzRoomStatPoints, HzRoomStatInfo, HzLocation
from hzglobal import HZ_BUILDING_ID, HZ_FLOOR_NO
from elecrail import pnpoly
from rooms import HZ_ROOMS, HZ_ROOM_NAME_BDXH
import datetime

"""
本模块功能列表：
人员盘点
    盘点区域
        新增盘点区域
        删除盘点区域
        修改盘点区域
        查询盘点区域
        设置默认盘点区域
    执行盘点
        定时盘点
            新增定时盘点
            删除定时盘点
            修改定时盘点
            查询定时盘点
        立即盘点
    查询盘点结果
"""


class PeopleStat:
    zone = {}   # 盘点区域表: {pd_name: {'id': 1, 'no': 'PD-20171222', 'points': {'x': 100, 'y': 100}}}

    def __init__(self):
        pass

    def get_data(self):
        """
        从数据库获取盘点配置
        """
        pds = HzRoomStatCfg.query.all()
        for pd in pds:
            item = {'id': pd.id, 'no': pd.no}
            pts = HzRoomStatPoints.query.filter_by(room_id=pd.id).all()
            points = []
            for pt in pts:
                points.append({'x': pt.x, 'y': pt.y})
            item['points'] = points
            self.zone[pd.name] = item

    @staticmethod
    def add_zone(name, points, people_num=0):
        """
        增加盘点区域配置
        返回值：
            errorCode   msg
            ---------   --------------------------------------------------------
            0           新增成功！
            101         输入参数错误！
            1001        名称[%s]已经存在！
            105         盘点区域顶点数须大于等于3！
        """

        # 判断名称是否重复
        has = HzRoomStatCfg.query.filter(HzRoomStatCfg.name == name).first()
        if has is not None:
            return {'errorCode': 1001, 'msg': u'名称[%s]已经存在！' % name}
        param = {'name': name, 'buildingId': HZ_BUILDING_ID, 'floorNo': HZ_FLOOR_NO, 'expectNum': people_num}
        pd = HzRoomStatCfg(param)
        db.session.add(pd)
        pd = HzRoomStatCfg.query.filter_by(no=pd.no).first()

        """ 增加盘点区域顶点配置 """
        if len(points) < 3:
            return {'errorCode': 105, 'msg': u'盘点区域顶点数须大于等于3！'}
        for vt in points:
            pdp = HzRoomStatPoints(room_id=pd.id, x=vt['x'], y=vt['y'])
            db.session.add(pdp)

        db.session.commit()
        return {'errorCode': 0, 'msg': u'新增成功！'}

    @staticmethod
    def add_zone_room_bd():
        """
        增加盘点区域配置——Room1 北斗羲和
        """
        for room in HZ_ROOMS:
            if room['name'] == HZ_ROOM_NAME_BDXH:
                return PeopleStat.add_zone(HZ_ROOM_NAME_BDXH, room['points'])
        return {'errorCode': 500, 'msg': u'添加失败！'}

    def stat(self):
        """
        立即盘点

        """
        self.get_data()
        tm = datetime.datetime.today()
        no = HzRoomStatInfo.gen_no()
        uid_coord = self.get_location()

        for z in self.zone:
            num = 0
            for usr in uid_coord:
                if pnpoly(self.zone[z]['points'], uid_coord[usr][0], usr[1]):  # in room
                    num += 1
            param = {'roomId': self.zone[z]['id'], 'peopleNum': num, 'datetime': tm, 'no': no}
            psi = HzRoomStatInfo(param)
            db.session.add(psi)
        db.session.commit()
        return self.get_stat_info(no)

    @staticmethod
    def get_location():
        """
        查询 每个ID对应的最新坐标
        :return:
        """
        location = HzLocation.query.group_by(HzLocation.user_id)
        uid_coord = {}
        for loc in location:  # 如果存在，则获取最新的一个坐标
            uid_coord[loc.user_id] = [loc.x, loc.y]
        return uid_coord

    @staticmethod
    def get_stat_info(no):
        """
        查询盘点信息
        :param no:         盘点编号 -- 查询过滤条件
        :return:
            errorCode
            msg
            statInfo:       盘点信息
                id                  记录ID
                statNo              盘点编号
                roomName            盘点区域名称
                roomId              盘点区域ID
                roomNo              盘点区域编号
                roomCreateAt        盘点区域创建时间
                curPeopleNum        盘点时人数
                expectNum           期望人数
                datetime            盘点时间
        """
        psi = HzRoomStatInfo.query.filter_by(no=no)\
            .join(HzRoomStatCfg, HzRoomStatCfg.id == HzRoomStatInfo.room_id)\
            .add_columns(HzRoomStatCfg.name, HzRoomStatCfg.no, HzRoomStatCfg.create_at, HzRoomStatCfg.expect_num).all()
        stat_info = []
        for info in psi:
            stat_info.append({'id': info[0].id, 'statNo': info[0].no, 'roomName': info[1], 'roomId': info[0].room_id,
                              'roomNo': info[2], 'curPeopleNum': info[0].people_num,
                              'roomCreateAt': datetime.datetime.strftime(info[3], '%Y-%m-%d %H:%M:%S'),
                              'datetime': datetime.datetime.strftime(info[0].datetime, '%Y-%m-%d %H:%M:%S'),
                              'expectNum': info[4]})
        return {'errorCode': 0, 'msg': 'ok', 'statInfo': stat_info}
