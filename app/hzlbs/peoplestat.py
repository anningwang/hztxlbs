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
    def add_zones(param):
        """
        增加盘点区域 —— 可以一次增加多个区域

        输入参数：
        {
            data: [{
                name:       盘点区域名称
                points:[{'x': 1, 'y': 2}, {'x': 3, 'y': 4},...]     盘点区域顶点坐标
                peopleNum:  应到人数，optional，不填或者填写值<=0，则认为该参数无效。否则，实际盘点人数不符时，给出告警提示
            }]
        ]
        :return:
        {
            errorCode   msg
            ---------   --------------------------------------------------------
            0           新增成功！
            101         输入参数错误！
            1001        名称[%s]已经存在！
            105         盘点区域顶点数须大于等于3！
        }
        """

        if 'data' not in param:
            return {'errorCode': 101, 'msg': u'输入参数错误！缺少[data]字段'}

        for dt in param['data']:
            if 'name' not in dt:
                return {'errorCode': 101, 'msg': u'输入参数错误！缺少[name]字段'}
            name = dt['name']

            if 'points' not in dt:
                return {'errorCode': 101, 'msg': u'输入参数错误！缺少[points]字段'}
            points = dt['points']

            people_num = 0 if 'peopleNum' not in dt or dt['peopleNum'] == '' else int(dt['peopleNum'])

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
    def add_zone(name, points, people_num=0):
        """
        增加盘点区域配置 ——每次只能增加一个
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

        输入参数：
        无
        :return:
        {
            errorCode       msg
            ------------    -----------------------------
            0               'ok'

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
        }
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
            errorCode       msg
            ------------    -----------------------------
            0               'ok'

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

    @staticmethod
    def get_zone(param):
        """
        查询盘点区域配置

        输入参数(JSON格式)：
        {
            floorNo:    查询的楼层, 可选参数，不填则不作为过滤条件。目前该参数无实际意义
            page:       查询的页码。 当记录很多时，需要分页查询。可选参数，默认为第1页
            rows:       当前页记录条数。可选参数。默认50条

        }
        :return:
        {
            errorCode       msg
            ---------       -----------------------
            0               'ok'

            data:{     盘点区域配置
                total:      符合条件的记录总条数
                rows:[{     盘点信息详情
                    name:   盘点区域名称（所在房间）
                    points:[{   盘点区域顶点坐标。（坐标应符合连续逆时针或者顺时针的顺序。当前要求：按逆时针顺序）
                        x:  横坐标，物理坐标，单位 毫米 mm
                        y:  纵坐标，物理坐标，单位 mm
                    }]
                    zoneNo:     盘点区域编号。后台生成的唯一编号。
                    id:         盘点区域 Id
                    expectNum:  期望人数
                    createAt:   区域创建时间
                    buildId:    建筑ID
                    floorNo:    楼层号
                }]
            }
        }
        """
        hzq = HzRoomStatCfg.query
        floor_no = param['floorNo'] if 'floorNo' in param else ''
        if floor_no != '':
            hzq = hzq.filter_by(floor_no=floor_no)
        page = 1 if 'page' not in param or param['page'] == '' else int(param['page'])
        rows = 50 if 'rows' not in param or param['rows'] == '' else int(param['rows'])

        total = hzq.count()

        if page < 1:
            page = 1
        offset = (page - 1) * rows

        records = hzq.limit(rows).offset(offset).all()
        rs = []
        for rec in records:
            """ 查询 盘点区域的顶点信息 """
            pts = HzRoomStatPoints.query.filter_by(room_id=rec.id).order_by(HzRoomStatPoints.id.asc()).all()
            points = []
            for pt in pts:
                points.append({'x': pt.x, 'y': pt.y})
            rs.append({'id': rec.id, 'zoneNo': rec.no, 'buildId': rec.build_id, 'floorNo': rec.floor_no,
                       'expectNum': rec.expect_num, 'name': rec.name,
                       'createAt': datetime.datetime.strftime(rec.create_at, '%Y-%m-%d %H:%M:%S'),
                       'points': points
                       })

        return {'errorCode': 0, 'msg': 'ok', 'data': {'total': total, 'rows': rs}}

    @staticmethod
    def del_zones(ids):
        """
        删除 盘点区域
        :param ids:     盘点区域id 列表
        :return: {
            errorCode       msg
            ----------      ------------------------------
            0               [%d]个盘点区域，[%d]个顶点信息被删除，[%d]条盘点记录被删除。
        }
        """
        vt = 0
        pd_num = 0
        for i in ids:
            """ 删除盘点区域顶点坐标 """
            vt += HzRoomStatPoints.query.filter_by(room_id=i).delete()

            """ 删除 盘点数据 """
            pd_num += HzRoomStatInfo.query.filter_by(room_id=i).delete()

        """ 删除 盘点区域 基本信息 """
        num = 0
        num += HzRoomStatCfg.query.filter(HzRoomStatCfg.id.in_(ids)).delete(synchronize_session=False)

        db.session.commit()
        return {'errorCode': 0,
                'msg': u'[%d]个盘点区域，[%d]个顶点信息被删除，[%d]条盘点记录被删除。' % (num, vt, pd_num)}

    @staticmethod
    def del_stat_results(ids):
        """
        删除 盘点结果
        :param ids:     记录id
        :return:
        {
            errorCode       msg
            ----------      ------------------------------
            0               [%d]条盘点记录被删除。
        }
        """
        num = 0
        num += HzRoomStatInfo.query.filter(HzRoomStatInfo.id.in_(ids)).delete(synchronize_session=False)

        db.session.commit()
        return {'errorCode': 0, 'msg': u'[%d]条盘点记录被删除。' % num}
