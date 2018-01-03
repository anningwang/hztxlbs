# coding=utf-8

from flask import request, jsonify
from apscheduler.schedulers.background import BackgroundScheduler
import datetime

from app import db, app
from app.models import HzRoomStatCfg, HzRoomStatPoints, HzRoomStatInfo, HzLocation, Jobs
from hzglobal import HZ_BUILDING_ID, HZ_FLOOR_NO
from elecrail import pnpoly
from rooms import HZ_ROOMS
from config import SQLALCHEMY_DB_SCHEDULER_URL

HZ_JOB_ID = 'ps-job-id'

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
    盘点结果
        查询
        删除
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
                expectNum:  应到人数，optional，不填或者填写值<=0，则认为该参数无效。否则，实际盘点人数不符时，给出告警提示
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

            expect_num = 0 if 'expectNum' not in dt or dt['expectNum'] == '' else int(dt['expectNum'])

            # 判断名称是否重复
            has = HzRoomStatCfg.query.filter(HzRoomStatCfg.name == name).first()
            if has is not None:
                return {'errorCode': 1001, 'msg': u'名称[%s]已经存在！' % name}
            param = {'name': name, 'buildingId': HZ_BUILDING_ID, 'floorNo': HZ_FLOOR_NO, 'expectNum': expect_num}
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
    def add_zones_default():
        """
        新增默认盘点区域

        输入参数：
        无
        :return:
        {
            errorCode       msg
            ------------    -----------------------------
            0               新增[%d]个盘点区域！
            105             盘点区域顶点数须大于等于3！
        }
        """
        num = 0
        for room in HZ_ROOMS:
            # 判断名称是否重复
            name = room['name']
            has = HzRoomStatCfg.query.filter(HzRoomStatCfg.name == name).first()
            if has is None:
                param = {'name': name, 'buildingId': HZ_BUILDING_ID, 'floorNo': HZ_FLOOR_NO, 'expectNum': 0}
                pd = HzRoomStatCfg(param)
                db.session.add(pd)
                pd = HzRoomStatCfg.query.filter_by(no=pd.no).first()

                """ 增加盘点区域顶点配置 """
                points = room['points']
                if len(points) < 3:
                    return {'errorCode': 105, 'msg': u'盘点区域顶点数须大于等于3！'}
                for vt in points:
                    pdp = HzRoomStatPoints(room_id=pd.id, x=vt['x'], y=vt['y'])
                    db.session.add(pdp)
            num += 1

        db.session.commit()
        return {'errorCode': 0, 'msg': u'新增[%d]个盘点区域！' % num}

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

            statInfo:[{      盘点信息
                id                  记录ID
                statNo              盘点编号
                roomName            盘点区域名称
                roomId              盘点区域ID
                roomNo              盘点区域编号
                roomCreateAt        盘点区域创建时间
                curPeopleNum        盘点时人数
                expectNum           期望人数
                datetime            盘点时间
            }]
        }
        """
        self.get_data()
        tm = datetime.datetime.today()
        no = HzRoomStatInfo.gen_no()
        uid_coord = self.get_location()

        for z in self.zone:
            num = 0
            for usr in uid_coord:
                if pnpoly(self.zone[z]['points'], uid_coord[usr][0], uid_coord[usr][1]):  # in room
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
        查询盘点结果
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

    @staticmethod
    def change_zones(param):
        """
        修改盘点区域
        输入参数：
        {
            data: [{    信息内容
                id:     记录ID
                name:   盘点区域名称，可选参数，不提供该参数，表示名称不做修改
                points:[{   盘点区域顶点坐标。（坐标应符合连续逆时针或者顺时针的顺序。当前要求：按逆时针顺序）
                            可选参数。 不涉及顶点修改，可以不传递。
                            若该参数有改动，需要传递最终状态的完整顶点信息。
                    x:  横坐标，物理坐标，单位 毫米 mm
                    y:  纵坐标，物理坐标，单位 mm
                }]
                expectNum:  应到人数，可选参数
                buildingId:     建筑id，保留
                floorNo:        楼层号，保留
            }]
        }
        :return:
        {
            errorCode       msg
            ------------    --------------------------------
            0               更新成功
            100             [data] field required.
            200             [id] field required.
            101             输入参数错误
            102             盘点区域[%s]已经存在！ (重复添加)
            103             ID为[%d]的盘点区域不存在！
            104             修改后的盘点区域名称[%s]和现有的重名！
            105             盘点区域顶点数须大于等于3！
        }
        """
        if 'data' not in param:
            return {'errorCode': 100, 'msg': '[data] field required.'}

        try:
            obj = param['data']
            for rec in obj:
                if 'id' not in rec or int(rec['id']) <= 0:
                    return {'errorCode': 200, 'msg': '[id] field required.'}

                """ 更新 盘点区域 """
                zone = HzRoomStatCfg.query.get(rec['id'])
                if zone is None:
                    return {'errorCode': 103, 'msg': u'ID为[%d]的盘点区域不存在！' % rec['id']}

                if 'name' in rec:
                    """ 判断修改后的盘点区域名称是否和已有的重名 """
                    records = HzRoomStatCfg.query.filter_by(name=rec['name']).all()
                    for r in records:
                        if r.id == rec['id']:
                            continue
                        return {'errorCode': 104, 'msg': u'修改后的盘点区域名称[%s]和现有的重名！' % rec['name']}
                zone.update(rec)
                db.session.add(zone)

                if 'points' in rec and rec['points'] is not None:
                    HzRoomStatPoints.query.filter_by(room_id=rec['id']).delete()
                    """ 增加围栏顶点配置 """
                    if len(rec['points']) < 3:
                        return {'errorCode': 105, 'msg': u'盘点区域顶点数须大于等于3！'}
                    for vt in rec['points']:
                        pt = HzRoomStatPoints(room_id=rec['id'], x=vt['x'], y=vt['y'])
                        db.session.add(pt)
        except KeyError:
            return {'errorCode': 101, 'msg': u'输入参数错误！'}

        db.session.commit()
        return {'errorCode': 0, 'msg': u'更新成功！'}

    @staticmethod
    def get_stat_results(param):
        """
        查询盘点结果

        输入参数：
        {
            statNo:         盘点编号， 例如：'PD-20171222-165201', 可选，若不填写，该字段不作为过滤条件
            roomName:       盘点区域名称，例如：["北斗羲和", "智慧消防"], 可选，若不填写，该字段不作为过滤条件
            datetimeFrom:   查询起始时间，例如："2017-08-17 11:17:35",   可选，若不填写，该字段不作为过滤条件
            datetimeTo:     查询结束时间，例如："2017-09-23 11:17:35",   可选，不填写时，该字段不作为过滤条件
            page:           查询的页码。 当记录很多时，需要分页查询。可选参数，默认为第1页
            rows:           当前页记录条数。可选参数。默认100条
            sort: [{"field": "datetime", "oper": "desc"},   记录排序规则， 可选参数，默认按照时间降序排序
                   {"field": "roomName", "oper": "desc"}]   按照房间名称排序，可选参数，默认按照升序排序
                当前条件只支持 and 。
                oper 取值： desc 降序（默认）， asc 升序。 可以不填oper，默认降序
                字段顺序 代表 查询时的排序顺序。
                目前支持 datetime, roomName 排序
        }

        :return:
        {
            errorCode       msg
            ---------       --------------------------------------------------------
            0               ok
            100             缺少输入参数

            data:{          数据内容
                total:      符合条件的记录条数
                rows:[{     盘点信息详情
                    id:             记录ID
                    statNo:         盘点编号
                    roomName:       盘点区域名称
                    roomId:         盘点区域ID
                    roomNo:         盘点区域编号
                    roomCreateAt:   盘点区域创建时间
                    curPeopleNum:   盘点时人数
                    expectNum:      期望人数
                    datetime:       盘点时间
                    no:             记录序号
                }]
            }
        }
        """
        if param is None:
            return {'errorCode': 100, 'msg': u'缺少输入参数！'}

        hzq = HzRoomStatInfo.query.join(HzRoomStatCfg, HzRoomStatCfg.id == HzRoomStatInfo.room_id)

        if 'statNo' in param and param['statNo'] != '':
            hzq = hzq.filter(HzRoomStatInfo.no == param['statNo'])

        if 'roomName' in param and param['roomName'] != []:
            hzq = hzq.filter(HzRoomStatInfo.name.in_(param['roomName']))

        if 'datetimeFrom' in param:
            hzq = hzq.filter(HzRoomStatInfo.datetime >= param['datetimeFrom'])
        if 'datetimeTo' in param:
            hzq = hzq.filter(HzRoomStatInfo.datetime <= param['datetimeTo'])
        page = 1 if 'page' not in param or param['page'] == '' else int(param['page'])
        rows = 100 if 'rows' not in param or param['rows'] == '' else int(param['rows'])

        total = hzq.count()

        if 'sort' in param:
            for st in param['sort']:
                is_desc = True if 'oper' not in st or st['oper'] == 'desc' else False
                if st['field'] == 'datetime':
                    if is_desc:
                        hzq = hzq.order_by(HzRoomStatInfo.datetime.desc())
                    else:
                        hzq = hzq.order_by(HzRoomStatInfo.datetime)
                elif st['field'] == 'roomName':
                    if is_desc:
                        hzq = hzq.order_by(HzRoomStatCfg.name.desc())
                    else:
                        hzq = hzq.order_by(HzRoomStatCfg.name)
        else:
            hzq = hzq.order_by(HzRoomStatInfo.datetime.desc())

        if page < 1:
            page = 1
        offset = (page - 1) * rows
        hzq = hzq.add_columns(HzRoomStatCfg.name, HzRoomStatCfg.no, HzRoomStatCfg.create_at, HzRoomStatCfg.expect_num)
        records = hzq.limit(rows).offset(offset).all()
        i = offset + 1
        rs = []
        for info in records:
            rs.append({'id': info[0].id, 'statNo': info[0].no, 'roomName': info[1], 'roomId': info[0].room_id,
                       'roomNo': info[2], 'curPeopleNum': info[0].people_num,
                       'roomCreateAt': datetime.datetime.strftime(info[3], '%Y-%m-%d %H:%M:%S'),
                       'datetime': datetime.datetime.strftime(info[0].datetime, '%Y-%m-%d %H:%M:%S'),
                       'expectNum': info[4], 'no': i})
            i += 1
        return {'errorCode': 0, 'msg': 'ok', 'data': {'total': total, 'rows': rs}}

    @staticmethod
    def add_jobs(param):
        """
        增加定时盘点任务
        :param param:           输入参数，JSON 格式
        {
            data: [{                日期相关参数，限制任务的开始时间
                name:       str     任务名称，唯一
                dayOfWeek:  str     周几，可选，不填或为空字符，表示每天循环。 0 表示周一，6 表示周六。
                                    多个日期用逗号分割，例如：0,1,2,3,4 表示周一至周五
                hour:       str     小时，取值范围 0~23。多个小时用逗号分割
                minute:     str     分钟，取值范围 0~59。多个分钟用逗号分割。可选，默认为0
                second:     str     秒，取值范围 0~59。多个秒值用逗号分割。 可选，默认为0
                startDate:  str     任务开始日期（包含本日期），格式： 年-月-日 时:分:秒 （2017-12-24 13:30:00）
                                    可选参数，不填或为空字符，该字段无意义
                endDate:    str     任务结束日期（包含本日期），格式： 年-月-日 时:分:秒 （2018-12-24 13:30:00）
                                    可选参数，不填或为空字符，该字段无意义
            }]
        }
        :return:
        {
            errorCode       msg
            ---------       --------------------------------------------------------
            0               ok
            100             缺少输入参数！
            101             输入参数错误！缺少[data]字段.
            102             输入参数错误！缺少[hour]字段
            103             输入参数错误！缺少[name]字段
            104             [name]字段[=%s]已经存在！
            200             任务信息写数据库失败。
        }
        """
        if param is None:
            return {'errorCode': 100, 'msg': u'缺少输入参数！'}
        if 'data' not in param:
            return {'errorCode': 101, 'msg': u'输入参数错误！缺少[data]字段'}

        job_parm = []
        for dt in param['data']:
            if 'name' not in dt:
                return {'errorCode': 103, 'msg': u'输入参数错误！缺少[name]字段'}
            name = dt['name']
            day_of_week = dt['dayOfWeek'] if 'dayOfWeek' in dt else None
            if 'hour' not in dt:
                return {'errorCode': 102, 'msg': u'输入参数错误！缺少[hour]字段'}
            hour = dt['hour']

            minute = dt['minute'] if 'minute' in dt and dt['minute'] != '' else 0
            second = dt['second'] if 'second' in dt and dt['second'] != '' else 0
            start_date = dt['startDate'] if 'startDate' in dt and dt['startDate'] != '' else None
            end_date = dt['endDate'] if 'endDate' in dt and dt['endDate'] != '' else None

            """ 校验 name 字段 不能重复"""
            has = Jobs.query.filter_by(name=name).first()
            if has is not None:
                return {'errorCode': 104, 'msg': u'[name]字段[=%s]已经存在！' % name}

            """ 将job信息写入数据库 """
            no = Jobs.gen_no()
            job = Jobs(name=name, hour=hour, minute=minute, second=second, day_of_week=day_of_week,
                       start_date=start_date, end_date=end_date, create_at=datetime.datetime.today(),
                       no=no)
            db.session.add(job)
            job = Jobs.query.filter_by(no=no).first()
            if job is None:
                return {'errorCode': 201, 'msg': u'任务信息写数据库失败。'}

            job_parm.append({'day_of_week': day_of_week, 'hour': hour, 'minute': minute,
                             'second': second, 'start_date': start_date, 'end_date': end_date,
                             'name': name, 'id': PeopleStat.gen_job_id(job.id)})

        db.session.commit()

        for jp in job_parm:
            ps_scheduler.add_job(job_stat, trigger='cron', day_of_week=jp['day_of_week'],
                                 hour=jp['hour'], minute=jp['minute'],
                                 second=jp['second'], start_date=jp['start_date'], end_date=jp['end_date'],
                                 name=jp['name'], id=jp['id'])

        return {'errorCode': 0, 'msg': 'ok'}

    @staticmethod
    def del_jobs(ids):
        """
        删除定时盘点任务
        :param ids:     任务id 列表
        :return:
        {
            errorCode       msg
            ---------       --------------------------------------------------------
            0               [%d]个job记录被删除，[%d]个运行job被删除。
        }
        """
        real_task_num = 0
        for i in ids:
            job = Jobs.query.get(i)
            if job is not None:
                job_id = PeopleStat.gen_job_id(job.id)
                task = ps_scheduler.get_job(job_id)
                if task is not None:
                    ps_scheduler.remove_job(job_id)
                    real_task_num += 1

        """ 删除 定时任务 """
        num = 0
        num += Jobs.query.filter(Jobs.id.in_(ids)).delete(synchronize_session=False)

        db.session.commit()
        return {'errorCode': 0, 'msg': u'[%d]个job记录被删除，[%d]个运行job被删除。' % (num, real_task_num)}

    @staticmethod
    def change_jobs(param):
        """
        修改定时盘点任务

        :param param:           输入参数，JSON 格式
        {
            data: [{  要修改的任务字段，可选字段，表示忽略对应字段
                id:         int     任务id
                name:       str     任务名称，可选参数
                dayOfWeek:  str     周几，可选参数
                                    0 表示周一，6 表示周六。
                                    多个日期用逗号分割，例如：0,1,2,3,4 表示周一至周五
                hour:       str     小时，取值范围 0~23。多个小时用逗号分割， 可选参数
                minute:     str     分钟，取值范围 0~59。多个分钟用逗号分割。可选参数
                second:     str     秒，取值范围 0~59。多个秒值用逗号分割。 可选参数
                startDate:  str     任务开始日期（包含本日期），格式： 年-月-日 时:分:秒 （2017-12-24 13:30:00）
                                    可选参数
                endDate:    str     任务结束日期（包含本日期），格式： 年-月-日 时:分:秒 （2018-12-24 13:30:00）
                                    可选参数
            }]
        }
        :return:
        {
            errorCode       msg
            ---------       --------------------------------------------------------
            0               ok
            100             缺少输入参数！
            101             输入参数错误，缺少[data]字段！
            102             输入参数错误，缺少[id]字段！
        }
        """
        if param is None:
            return {'errorCode': 100, 'msg': u'缺少输入参数！'}
        if 'data' not in param:
            return {'errorCode': 101, 'msg': u'输入参数错误，缺少[data]字段！'}

        job_parm = []
        for dt in param['data']:
            if 'id' not in dt:
                return {'errorCode': 102, 'msg': u'输入参数错误，缺少[id]字段！'}
            jid = dt['id']
            name = dt['name'] if 'name' in dt and dt['name'] != '' else None
            day_of_week = dt['dayOfWeek'] if 'dayOfWeek' in dt and dt['dayOfWeek'] != '' else None
            hour = dt['hour'] if 'hour' in dt and dt['hour'] != '' else None
            minute = dt['minute'] if 'minute' in dt and dt['minute'] != '' else None
            second = dt['second'] if 'second' in dt and dt['second'] != '' else None
            start_date = dt['startDate'] if 'startDate' in dt and dt['startDate'] != '' else None
            end_date = dt['endDate'] if 'endDate' in dt and dt['endDate'] != '' else None

            job = Jobs.query.get(jid)
            if job is None:
                return {'errorCode': 103, 'msg': u'不存在id为[%d]的任务记录！' % jid}
            if name is not None:
                job.name = name
            if day_of_week is not None:
                job.day_of_week = day_of_week
            else:
                day_of_week = job.day_of_week

            if hour is not None:
                job.hour = hour
            else:
                hour = job.hour

            if minute is not None:
                job.minute = minute
            else:
                minute = job.minute

            if second is not None:
                job.second = second
            else:
                second = job.second

            if start_date is not None:
                job.start_date = start_date
            else:
                start_date = job.start_date

            if end_date is not None:
                job.end_date = end_date
            else:
                end_date = job.end_date

            db.session.add(job)

            job_parm.append({'day_of_week': day_of_week, 'hour': hour, 'minute': minute,
                             'second': second, 'start_date': start_date, 'end_date': end_date,
                             'name': name, 'id': jid})

        db.session.commit()
        for jp in job_parm:
            job_id = PeopleStat.gen_job_id(jp['id'])
            job = ps_scheduler.get_job(job_id)
            if job is not None:
                name = jp['name']
                if name is not None:
                    ps_scheduler.modify_job(job_id, name=name)
                day_of_week = jp['day_of_week']
                hour = jp['hour']
                minute = jp['minute']
                second = jp['second']
                start_date = jp['start_date']
                end_date = jp['end_date']
                ps_scheduler.reschedule_job(job_id, trigger='cron', day_of_week=day_of_week, hour=hour,
                                            minute=minute, second=second,
                                            start_date=start_date, end_date=end_date)
        return {'errorCode': 0, 'msg': 'ok'}

    @staticmethod
    def get_jobs(param):
        """
        查询定时盘点任务
        :param param:
        {
            page:       查询的页码。 当记录很多时，需要分页查询。可选参数，默认为第1页
            rows:       当前页记录条数。可选参数。默认50条
        }
        :return:
        {
            errorCode       msg
            ---------       --------------------------------------------------------
            0               ok
            100             缺少输入参数！


            data: [{
                total:      int     符合条件的记录条数
                rows:[{
                    id:         int     任务id， 唯一
                    no:         str     任务编号，唯一
                    name:       str     任务名称
                    dayOfWeek:  str     周几，为空，表示每天循环。 0 表示周一，6 表示周六。
                                        多个日期用逗号分割，例如：0,1,2,3,4 表示周一至周五
                    hour:       str     小时，取值范围 0~23。多个小时用逗号分割
                    minute:     str     分钟，取值范围 0~59。多个分钟用逗号分割
                    second:     str     秒，取值范围 0~59。多个秒值用逗号分割。 默认为0
                    startDate:  str     任务开始日期（包含本日期），格式： 年-月-日 时:分:秒 （2017-12-24 13:30:00）
                                        为空字符，该字段无意义
                    endDate:    str     任务结束日期（包含本日期），格式： 年-月-日 时:分:秒 （2018-12-24 13:30:00）
                                        为空字符，该字段无意义
                    createAt:   datetime    任务创建时间，格式 yyyy-mm-dd HH:mm:ss
                }]
            }]
        }
        """
        print ps_scheduler.get_jobs()          # Return type:	list[Job] --> Job 对象 列表
        ps_scheduler.print_jobs()

        if param is None:
            return {'errorCode': 100, 'msg': u'缺少输入参数！'}

        page = 1 if 'page' not in param or param['page'] == '' else int(param['page'])
        rows = 100 if 'rows' not in param or param['rows'] == '' else int(param['rows'])
        hzq = Jobs.query
        if page < 1:
            page = 1
        offset = (page - 1) * rows

        total = hzq.count()
        records = hzq.limit(rows).offset(offset).all()

        rs = []
        for rec in records:
            rs.append({'id': rec.id, 'name': rec.name, 'dayOfWeek': rec.day_of_week,
                       'hour': rec.hour, 'minute': rec.minute, 'second': rec.second,
                       'startDate': rec.start_date, 'endDate': rec.end_date,
                       'no': rec.no,
                       'createAt': datetime.datetime.strftime(rec.create_at, '%Y-%m-%d %H:%M:%S')
                       })

        return {'errorCode': 0, 'msg': 'ok', 'data': {'total': total, 'rows': rs}}

    @staticmethod
    def gen_job_id(uid):
        """ 生成 job id， 供 APScheduler 使用"""
        job_id = '%s-%d' % (HZ_JOB_ID, uid)
        return job_id


# 实例化 人员盘点 对象
ps = PeopleStat()


def job_stat():
    """ 定时盘点任务 """
    with app.app_context():
        ps.stat()


ps_scheduler = BackgroundScheduler()
ps_scheduler.add_jobstore('sqlalchemy', url=SQLALCHEMY_DB_SCHEDULER_URL)
ps_scheduler.start()


# 人员盘点功能 +++++ route begin +++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++

@app.route('/lbs/people_stat_cfg_add', methods=['POST'])
def people_stat_cfg_add():
    """ 新增盘点区域 """
    return jsonify(ps.add_zones(request.json))


@app.route('/lbs/people_stat_cfg_add_default', methods=['POST'])
def people_stat_cfg_add_default():
    """ 新增默认盘点区域 """
    return jsonify(ps.add_zones_default())


@app.route('/lbs/people_stat_cfg_get', methods=['POST'])
def people_stat_cfg_get():
    """ 查询盘点区域配置 """
    return jsonify(ps.get_zone(request.json))


@app.route('/lbs/people_stat_cfg_chg', methods=['POST'])
def people_stat_cfg_chg():
    """ 修改盘点区域 """
    return jsonify(ps.change_zones(request.json))


@app.route('/lbs/people_stat_do', methods=['POST'])
def people_stat_do():
    """ 立即盘点 """
    return jsonify(ps.stat())


@app.route('/lbs/people_stat_task_add', methods=['POST'])
def people_stat_task_add():
    """ 增加定时盘点任务 """
    return jsonify(ps.add_jobs(request.json))


@app.route('/lbs/people_stat_task_chg', methods=['POST'])
def people_stat_task_chg():
    """ 修改定时盘点任务 """
    return jsonify(ps.change_jobs(request.json))


@app.route('/lbs/people_stat_task_get', methods=['POST'])
def people_stat_task_get():
    """ 查询定时盘点任务 """
    return jsonify(ps.get_jobs(request.json))


@app.route('/lbs/people_stat_get', methods=['POST'])
def people_stat_get():
    """ 查询盘点结果 """
    return jsonify(ps.get_stat_results(request.json))

# 人员盘点功能 ---- route end --------------------------------------------------------------------------
