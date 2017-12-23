# -*- coding:utf-8 -*-
import hashlib
from app import db
from app import app
import flask_whooshalchemy as whooshalchemy
import re
import datetime
from hzlbs.hzglobal import gen_code, gen_code_seconds


ROLE_USER = 0
ROLE_ADMIN = 1

followers = db.Table('followers',
                     db.Column('follower_id', db.Integer, db.ForeignKey('user.id')),
                     db.Column('followed_id', db.Integer, db.ForeignKey('user.id'))
                     )


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    nickname = db.Column(db.String(64), unique=True)
    email = db.Column(db.String(120), index=True, unique=True)
    role = db.Column(db.SmallInteger, default=ROLE_USER)
    posts = db.relationship('Post', backref='author', lazy='dynamic')
    about_me = db.Column(db.String(140))
    last_seen = db.Column(db.DateTime)
    followed = db.relationship('User',
                               secondary=followers,
                               primaryjoin=(followers.c.follower_id == id),
                               secondaryjoin=(followers.c.followed_id == id),
                               backref=db.backref('followers', lazy='dynamic'),
                               lazy='dynamic')

    @staticmethod
    def make_valid_nickname(nickname):
        return re.sub('[^a-zA-Z0-9_\.]', '', nickname)

    @staticmethod
    def make_unique_nickname(nickname):
        if User.query.filter_by(nickname=nickname).first() is None:
            return nickname
        version = 2
        while True:
            new_nickname = nickname + str(version)
            if User.query.filter_by(nickname=new_nickname).first() is None:
                break
            version += 1
        return new_nickname

    @property
    def is_authenticated(self):
        return True

    @property
    def is_active(self):
        return True

    @property
    def is_anonymous(self):
        return False

    def get_id(self):
        return unicode(self.id)

    def avatar(self, size):
        return 'http://cn.gravatar.com/avatar/' + hashlib.md5(self.email).hexdigest() + '?d=mm&s=' + str(size)
        # http://www.gravatar.com/avatar/
        
    def follow(self, user):
        if not self.is_following(user):
            self.followed.append(user)
            return self
            
    def unfollow(self, user):
        if self.is_following(user):
            self.followed.remove(user)
            return self
            
    def is_following(self, user):
        return self.followed.filter(followers.c.followed_id == user.id).count() > 0

    def followed_posts(self):
        return Post.query.join(followers, (followers.c.followed_id == Post.user_id)).filter(
            followers.c.follower_id == self.id).order_by(Post.timestamp.desc())

    def __repr__(self):     # pragma: no cover
        return '<User %r>' % self.nickname


class Post(db.Model):
    __searchable__ = ['body']
    
    id = db.Column(db.Integer, primary_key=True)
    body = db.Column(db.String(140))
    timestamp = db.Column(db.DateTime)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'))
    language = db.Column(db.String(5))
    
    def __repr__(self):     # pragma: no cover
        return '<Post %r>' % self.body


class HzToken(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    license = db.Column(db.String(140))
    token = db.Column(db.String(140))
    refresh_token = db.Column(db.String(140))
    expires_in = db.Column(db.Integer)
    timestamp = db.Column(db.DateTime)

    def __repr__(self):
        return '<HzToken %r>' % self.token


class HzLocation(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    build_id = db.Column(db.String(40))
    floor_no = db.Column(db.String(40))
    user_id = db.Column(db.String(40))
    x = db.Column(db.Float)
    y = db.Column(db.Float)
    timestamp = db.Column(db.DateTime)

    def __repr__(self):
        return '<HzLocation %r>' % self.user_id


class HzElecTail(db.Model):
    """ 电子围栏表 """
    id = db.Column(db.Integer, primary_key=True)
    build_id = db.Column(db.String(40))
    floor_no = db.Column(db.String(40))
    user_id = db.Column(db.String(40))
    x = db.Column(db.Float)
    y = db.Column(db.Float)
    timestamp = db.Column(db.DateTime)
    status = db.Column(db.Integer)      # 进入(1) or 退出(0) 围栏
    rail_no = db.Column(db.String(40))     # 围栏编号

    def __repr__(self):
        return '<HzElecTail %r>' % self.user_id


class HzElecTailCfg(db.Model):
    """ 电子围栏配置表 """
    id = db.Column(db.Integer, primary_key=True)
    rail_no = db.Column(db.String(40))  # 围栏编号
    name = db.Column(db.String(40))     # 电子围栏名称
    build_id = db.Column(db.String(40))
    floor_no = db.Column(db.String(40))
    create_at = db.Column(db.DateTime)

    def __init__(self, param):
        self.rail_no = self.create_no()
        self.name = param['name']
        if 'buildingId' in param:
            self.build_id = param['buildingId']
        if 'floorNo' in param:
            self.floor_no = param['floorNo']
        self.create_at = datetime.datetime.today()

    def update(self, param):
        if 'name' in param:
            self.name = param['name']
        if 'buildingId' in param:
            self.build_id = param['buildingId']
        if 'floorNo' in param:
            self.floor_no = param['floorNo']

    def create_no(self):
        search_sno = gen_code('WL')
        et = HzElecTailCfg.query.filter(HzElecTailCfg.rail_no.like('%' + search_sno + '%'))\
            .order_by(HzElecTailCfg.id.desc()).first()
        number = 1 if et is None else int(et.rail_no.rsplit('-', 1)[1]) + 1
        self.rail_no = search_sno + ('%03d' % number)
        return self.rail_no


class HzEtPoints(db.Model):
    """ 电子围栏顶点坐标表 """
    id = db.Column(db.Integer, primary_key=True)
    et_id = db.Column(db.Integer)   # 电子围栏id
    x = db.Column(db.Float)
    y = db.Column(db.Float)


class HzRoomStatCfg(db.Model):
    """ 人员盘点区域配置表 """
    id = db.Column(db.Integer, primary_key=True)
    no = db.Column(db.String(40))       # 盘点区域编号
    name = db.Column(db.String(40))     # 盘点区域名称
    build_id = db.Column(db.String(40))
    floor_no = db.Column(db.String(40))
    create_at = db.Column(db.DateTime)
    expect_num = db.Column(db.Integer)  # 期望人数

    def __init__(self, param):
        self.no = self.create_no()
        self.name = param['name']
        if 'buildingId' in param:
            self.build_id = param['buildingId']
        if 'floorNo' in param:
            self.floor_no = param['floorNo']
        self.create_at = datetime.datetime.today()
        self.expect_num = 0 if 'expectNum' not in param else param['expectNum']

    def create_no(self):
        search_no = gen_code('QY')
        dt = HzRoomStatCfg.query.filter(HzRoomStatCfg.no.like('%' + search_no + '%'))\
            .order_by(HzRoomStatCfg.id.desc()).first()
        number = 1 if dt is None else int(dt.no.rsplit('-', 1)[1]) + 1
        self.no = search_no + ('%03d' % number)
        return self.no


class HzRoomStatPoints(db.Model):
    """ 人员盘点区域顶点坐标表 """
    id = db.Column(db.Integer, primary_key=True)
    room_id = db.Column(db.Integer)     # 盘点区域id
    x = db.Column(db.Float)             # 存储物理坐标
    y = db.Column(db.Float)


class HzRoomStatInfo(db.Model):
    """ 人员盘点信息表 """
    id = db.Column(db.Integer, primary_key=True)
    no = db.Column(db.Integer)              # 盘点编号
    room_id = db.Column(db.Integer)         # 盘点区域id
    datetime = db.Column(db.DateTime)       # 盘点时间
    people_num = db.Column(db.Integer)      # 人数

    def __init__(self, param):
        self.no = self.create_no() if 'no' not in param else param['no']
        self.room_id = param['roomId']
        if 'datetime' in param:
            self.datetime = param['datetime']
        self.people_num = param['peopleNum']

    def create_no(self):
        self.no = self.gen_no()
        return self.no

    @staticmethod
    def gen_no():
        return gen_code_seconds('PD')


whooshalchemy.whoosh_index(app, Post)
