# -*- coding:utf-8 -*-
from flask import render_template, flash, redirect, session, url_for, request, g, jsonify
from flask_login import login_user, logout_user, current_user, login_required
from flask_sqlalchemy import get_debug_queries
from flask_babel import gettext
from app import app, db, lm, oid, babel
from forms import LoginForm, EditForm, PostForm, SearchForm
from models import User, ROLE_USER, Post, HzToken, HzLocation, HzElecTail, HzElecTailCfg, HzEtPoints
from emails import follower_notification
from guess_language import guessLanguage
from translate import microsoft_translate
from config import POSTS_PER_PAGE, MAX_SEARCH_RESULTS, LANGUAGES, DATABASE_QUERY_TIMEOUT
import random
import datetime
from dijkstra import min_dist2, get_nearest_vertex, hz_vertex
from lbs import TEST_UID, CUR_MAP_SCALE, HZ_MAP_GEO_WIDTH, HZ_MAP_GEO_HEIGHT
import json
from hzlbs.elecrail import get_elecrail
from hzlbs.hzglobal import HZ_BUILDING_ID, g_upd_et_cfg
from hzlbs.peoplestat import ps


@lm.user_loader
def load_user(uid):
    return User.query.get(int(uid))


@babel.localeselector
def get_locale():
    return request.accept_languages.best_match(LANGUAGES.keys())


@app.before_request
def before_request():
    g.user = current_user
    if g.user.is_authenticated:
        g.user.last_seen = datetime.datetime.utcnow()
        db.session.add(g.user)
        db.session.commit()
        g.search_form = SearchForm()
    g.locale = get_locale()


@app.after_request
def after_request(response):
    for query in get_debug_queries():
        if query.duration >= DATABASE_QUERY_TIMEOUT:
            app.logger.warning("SLOW QUERY: %s\nParameters: %s\nDuration: %fs\nContext: %s\n" %
                               (query.statement, query.parameters, query.duration, query.context))
    return response


@app.errorhandler(404)
def internal_error(error):
    return render_template('404.html', error=error), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html', error=error), 500


@app.route('/', methods=['GET', 'POST'])
@app.route('/index', methods=['GET', 'POST'])
@app.route('/index/<int:page>', methods=['GET', 'POST'])
@login_required
def index(page=1):
    form = PostForm()
    if form.validate_on_submit():
        language = guessLanguage(form.post.data)
        if language == 'UNKNOWN' or len(language) > 5:
            language = ''
        post = Post(body=form.post.data,
                    timestamp=datetime.datetime.utcnow(),
                    author=g.user,
                    language=language)
        db.session.add(post)
        db.session.commit()
        flash(gettext('Your post is now live!'))
        return redirect(url_for('index'))
    g.user.followed_posts()
    posts = g.user.followed_posts().paginate(page, POSTS_PER_PAGE, False)
    return render_template('index.html',
                           title='Home',
                           form=form,
                           posts=posts)


@app.route('/login', methods=['GET', 'POST'])
@oid.loginhandler
def login():
    if g.user is not None and g.user.is_authenticated:
        return redirect(url_for('index'))
    form = LoginForm()
    if form.validate_on_submit():
        session['remember_me'] = form.remember_me.data
        return oid.try_login(form.openid.data, ask_for=['nickname', 'email'])
    return render_template('login.html',
                           title='Sign In',
                           form=form,
                           providers=app.config['OPENID_PROVIDERS'])


@oid.after_login
def after_login(resp):
    if resp.email is None or resp.email == "":
        flash(gettext('Invalid login. Please try again.'))
        return redirect(url_for('login'))
    username = User.query.filter_by(email=resp.email).first()
    if username is None:
        nickname = resp.nickname
        if nickname is None or nickname == "":
            nickname = resp.email.split('@')[0]
        nickname = User.make_valid_nickname(nickname)
        nickname = User.make_unique_nickname(nickname)
        username = User(nickname=nickname, email=resp.email, role=ROLE_USER)
        db.session.add(username)
        db.session.commit()
        # make the user follow him/herself
        db.session.add(user.follow(username))
        db.session.commit()
    remember_me = False
    if 'remember_me' in session:
        remember_me = session['remember_me']
        session.pop('remember_me', None)
    login_user(username, remember=remember_me)
    return redirect(request.args.get('next') or url_for('index'))


@app.route('/logout')
def logout():
    logout_user()
    return redirect(url_for('index'))


@app.route('/user/<nickname>')
@app.route('/user/<nickname>/<int:page>')
@login_required
def user(nickname, page=1):
    username = User.query.filter_by(nickname=nickname).first()
    if username is None:
        flash(gettext('User %(nickname)s not found.', nickname=nickname))
        return redirect(url_for('index'))
    posts = username.posts.paginate(page, POSTS_PER_PAGE, False)
    return render_template('user.html', user=username, posts=posts)


@app.route('/edit', methods=['GET', 'POST'])
@login_required
def edit():
    form = EditForm(g.user.nickname)
    if form.validate_on_submit():
        g.user.nickname = form.nickname.data
        g.user.about_me = form.about_me.data
        db.session.add(g.user)
        db.session.commit()
        flash(gettext('Your changes have been saved.'))
        return redirect(url_for('edit'))
    elif request.method != "POST":
        form.nickname.data = g.user.nickname
        form.about_me.data = g.user.about_me
    return render_template('edit.html', form=form)


@app.route('/follow/<nickname>')
@login_required
def follow(nickname):
    username = User.query.filter_by(nickname=nickname).first()
    if username is None:
        flash('User ' + nickname + ' not found.')
        return redirect(url_for('index'))
    if username == g.user:
        flash(gettext('You can\'t follow yourself!'))
        return redirect(url_for('user', nickname=nickname))
    u = g.user.follow(username)
    if u is None:
        flash(gettext('Cannot follow %(nickname)s.', nickname=nickname))
        return redirect(url_for('user', nickname=nickname))
    db.session.add(u)
    db.session.commit()
    flash(gettext('You are now following %(nickname)s!', nickname=nickname))
    follower_notification(username, g.user)
    return redirect(url_for('user', nickname=nickname))


@app.route('/unfollow/<nickname>')
@login_required
def unfollow(nickname):
    username = User.query.filter_by(nickname=nickname).first()
    if username is None:
        flash('User ' + nickname + ' not found.')
        return redirect(url_for('index'))
    if username == g.user:
        flash(gettext('You can\'t unfollow yourself!'))
        return redirect(url_for('user', nickname=nickname))
    u = g.user.unfollow(username)
    if u is None:
        flash(gettext('Cannot unfollow %(nickname)s.', nickname=nickname))
        return redirect(url_for('user', nickname=nickname))
    db.session.add(u)
    db.session.commit()
    flash(gettext('You have stopped following %(nickname)s.', nickname=nickname))
    return redirect(url_for('user', nickname=nickname))


@app.route('/delete/<int:pid>')
@login_required
def delete(pid):
    post = Post.query.get(pid)
    if post is None:
        flash('Post not found.')
        return redirect(url_for('index'))
    if post.author.id != g.user.id:
        flash('You cannot delete this post.')
        return redirect(url_for('index'))
    db.session.delete(post)
    db.session.commit()
    flash('Your post has been deleted.')
    return redirect(url_for('index'))


@app.route('/search', methods=['POST'])
@login_required
def search():
    if not g.search_form.validate_on_submit():
        return redirect(url_for('index'))
    return redirect(url_for('search_results', query=g.search_form.search.data))


@app.route('/search_results/<query>')
@login_required
def search_results(query):
    results = Post.query.whoosh_search(query, MAX_SEARCH_RESULTS).all()
    return render_template('search_results.html',
                           query=query,
                           results=results)


@app.route('/translate', methods=['POST'])
@login_required
def translate():
    return jsonify({
        'text': microsoft_translate(
            request.form['text'],
            request.form['sourceLang'],
            request.form['destLang'])})


# JoySuch get Token
@app.route('/token', methods=['POST', 'GET'])
def gettoken():
    zoom_rule = CUR_MAP_SCALE
    mac = TEST_UID
    x = random.randint(30, int(HZ_MAP_GEO_WIDTH-1000))
    y = random.randint(30, int(HZ_MAP_GEO_HEIGHT-1000))
    token = "aa"
    refresh_token = "bb"

    hz_token = HzToken.query.all()
    if hz_token is not None and len(hz_token) != 0:
        token = hz_token[0].token
        refresh_token = hz_token[0].refresh_token

    hz_location = HzLocation.query.filter(HzLocation.user_id == mac).order_by(HzLocation.timestamp.desc())
    for loc in hz_location:     # 如果存在，则获取最新的一个坐标
        x = loc.x
        y = loc.y
        break

    return render_template('token.html',
                           token=token,
                           refreshToken=refresh_token,
                           mac=mac,
                           x=x,
                           y=y,
                           zoom_rule=zoom_rule)


@app.route('/show_all_users', methods=['POST', 'GET'])
@login_required
def show_all_users():
    users = User.query.all()
    return render_template('show_all_users.html', users=users)


@app.route('/get_location', methods=['POST'])
def get_pos():
    # user_id = request.form['userId']
    ret_loc = []
    hz_location = HzLocation.query.group_by(HzLocation.user_id)
    for loc in hz_location:  # 如果存在，则获取最新的一个坐标
        ret_loc.append({'userId': loc.user_id, 'x': loc.x, 'y': loc.y})

    # print ret_loc
    return jsonify(ret_loc)


@app.route('/go', methods=['POST'])
def get_path():
    location = int(request.form['location'])
    user_id = request.form['userId']
    px = py = 0

    points = []
    hz_location = HzLocation.query.group_by(HzLocation.user_id)
    for loc in hz_location:  # 如果存在，则获取最新的一个坐标
        if user_id == loc.user_id:
            px = loc.x
            py = loc.y
        points.append({'userId': loc.user_id, 'x': loc.x, 'y': loc.y})

    pt_from = get_nearest_vertex(px, py)
    path = min_dist2(pt_from, location)
    print path

    ret = []
    for p in path:
        ret.append(hz_vertex[p])

    ret_loc_with_path = {'x': px, 'y': py, 'path': ret, 'points': points}
    return jsonify(ret_loc_with_path)


@app.route('/test')
def hz_test():
    return render_template('test.html')


@app.route('/hz_history_loc')
def hz_history_loc():
    return render_template('hz_history_loc.html')


@app.route('/hz_electronic_rail')
def hz_electronic_rail():
    return render_template('hz_electronic_rail.html')


@app.route('/hz_er_alarm')
def hz_er_alarm():
    return render_template('hz_er_alarm.html')


@app.route('/hz_coord_get')
def hz_coord_get():
    return render_template('hz_coord_get.html')


@app.route('/hz_3d_map')
def hz_3d_map():
    return render_template('hz_3dmap.html')


@app.route('/hz_ps_zone')
def hz_ps_zone():
    return render_template('hz_ps_zone.html')


@app.route('/hz_ps_result', methods=['POST', 'GET'])
def hz_ps_result():
    return render_template('hz_ps_result.html')


@app.route('/lbs/get_history_location', methods=['POST'])
def get_history_location():
    """
    1.	查询历史轨迹
    输入参数：
        "userId": ["1918E00103AA", "1918E00103A9"],     // "userId": ["all"] for all users
        "datetimeFrom": "2017-08-17 11:17:35",          // 按照时间段查询
        "datetimeTo": "2017-09-23 11:17:35",
        "compress": false       // 是否压缩，压缩的含义是，服务器会根据特定策略返回部分路径坐标。 保留参数
        "page": 1,      查询的页码。 当记录很多时，需要分页查询。可选参数，默认为第一页
        "rows": 100     当前页记录条数。可选参数。默认100条
    :return:
    {
        errorCode   错误码
            0       成功
        msg         错误信息
            'ok'    成功
        data[{      历史轨迹记录。排序方式 userId， datetime。如果查询多个用户，无法控制每个用户
                        的记录条数，他们的总条数等于 输入参数 rows
            x       横坐标，实际物理坐标，单位 mm
            y       纵坐标
            datetime    时间格式（北京时间）： yyyy-mm-dd HH-MM-SS
        }]
        total       符合条件的记录条数
    }
    """
    if 'data' not in request.form:
        return jsonify({'errorCode': 100, 'msg': '[data] field required.'})

    obj = json.loads(request.form['data'])

    hzq = HzLocation.query.filter(HzLocation.timestamp >= obj['datetimeFrom'],
                                  HzLocation.timestamp <= obj['datetimeTo'])
    if obj['userId'][0] != 'all':
        hzq = hzq.filter(HzLocation.user_id.in_(obj['userId']))

    page = 1 if 'page' not in obj or obj['page'] == '' else int(obj['page'])
    rows = 100 if 'rows' not in obj or obj['rows'] == '' else int(obj['rows'])

    total = hzq.count()

    hzq = hzq.order_by(HzLocation.user_id, HzLocation.timestamp)

    if page < 1:
        page = 1
    offset = (page - 1) * rows
    records = hzq.limit(rows).offset(offset).all()

    uid = -1
    data = {}
    points = []
    for rec in records:
        if uid == rec.user_id:
            points.append({'x': rec.x, 'y': rec.y,
                           'datetime': datetime.datetime.strftime(rec.timestamp, '%Y-%m-%d %H:%M:%S')})
        else:
            if uid != -1:
                data[uid] = points
            uid = rec.user_id
            points = [{'x': rec.x, 'y': rec.y,
                       'datetime': datetime.datetime.strftime(rec.timestamp, '%Y-%m-%d %H:%M:%S')}]

    if uid != -1:
        data[uid] = points

    return jsonify({'errorCode': 0, 'msg': 'ok', 'data': data, 'total': total})


@app.route('/lbs/get_electronic_rail_cfg', methods=['POST'])
def get_electronic_rail_cfg():
    """
    查询电子围栏配置信息
    输入参数(JSON格式)：
    {
        data:{      输入参数
            floorNo:    查询的楼层
        }
    }
    :return:
    {
        errorCode   错误码
            ==0     成功
        msg         错误信息
            =='ok'  成功
        data:[{     电子围栏配置
            name:   围栏名称（所在房间）
            points:[{   围栏顶点坐标。（坐标应符合连续逆时针或者顺时针的顺序。当前要求：按逆时针顺序）
                x:  横坐标，物理坐标，单位 毫米 mm
                y:  纵坐标，物理坐标，单位 mm
            }]
            railNo:     电子围栏编号。后台生成的唯一编号。 added date 2017-10-01
            id:         电子围栏 Id
        }]
    }
    """
    if 'data' not in request.form:
        return jsonify({'errorCode': 100, 'msg': '[data] field required.'})

    obj = json.loads(request.form['data'])
    if 'floorNo' not in obj:
        return jsonify({'errorCode': 101, 'msg': '[floorNo] field required.'})

    elect = get_elecrail()
    records = HzElecTailCfg.query.all()
    for rec in records:
        etp = HzEtPoints.query.filter_by(et_id=rec.id).order_by(HzEtPoints.id).all()
        points = []
        for p in etp:
            points.append({'x': p.x, 'y': p.y})
        elect.append({'id': rec.id, 'name': rec.name, 'railNo': rec.rail_no, 'points': points})

    return jsonify({'errorCode': 0, 'msg': 'ok', 'data': elect})


@app.route('/lbs/get_electronic_rail_info', methods=['POST'])
def get_electronic_rail_info():
    """
    查询电子围栏告警（进入、离开围栏）信息

    查询条件、排序规则：
    "userId": ["1918E00103AA", "1918E00103A9"],  "userId": ["all"] for all users
    "datetimeFrom": "2017-08-17 11:17:35", 按照时间段查询, 可选，若不填写，时间段不作为过滤条件
    "datetimeTo": "2017-09-23 11:17:35", 结束日期，可选，不填写时，结束日期为 Now
    "page": 1,      查询的页码。 当记录很多时，需要分页查询。可选参数，默认为第一页
    "rows": 100,    当前页记录条数。可选参数。默认100条
    "sort": [{"field": "datetime", "oper": "desc"},     记录排序规则， 可选参数。
             {"field": "userId", "oper": "desc"}]       默认按照时间降序排序
        当前条件只支持 and 。
        oper取值： desc -- 降序（默认）， asc -- 升序。 可以不填oper，默认降序
        字段顺序代表查询时的排序顺序。
        目前支持的排序字段：datetime, userId, room
    :return:
    {
        errorCode   错误码
            == 0    成功
        msg         错误信息
            == 'ok' 成功提示
        data{       数据内容
            total   符合条件的记录条数
            rows[{  记录详情
                id          记录ID，数据库索引，备用。
                buildingId  建筑ID
                floorNo     楼层号
                x           横坐标，实际物理坐标，单位 mm
                y           纵坐标
                room        围栏名称
                status      告警状态， 1 进入围栏，0 退出围栏
                datetime    时间格式（北京时间）： yyyy-mm-dd HH-MM-SS
                userId      用户标识
                no          记录序号
            }]
        }
    }
    """
    if 'data' not in request.form:
        return jsonify({'errorCode': 100, 'msg': '[data] field required.'})

    obj = json.loads(request.form['data'])
    hzq = HzElecTail.query

    if obj['userId'][0] != 'all':
        hzq = hzq.filter(HzElecTail.user_id.in_(obj['userId']))

    if 'datetimeFrom' in obj and obj['datetimeFrom'] != '':
        hzq = hzq.filter(HzElecTail.timestamp >= obj['datetimeFrom'])
    if 'datetimeTo' in obj and obj['datetimeTo'] != '':
        hzq = hzq.filter(HzElecTail.timestamp <= obj['datetimeTo'])
    page = 1 if 'page' not in obj or obj['page'] == '' else int(obj['page'])
    rows = 100 if 'rows' not in obj or obj['rows'] == '' else int(obj['rows'])

    total = hzq.count()

    if 'sort' in obj:
        for st in obj['sort']:
            is_desc = True if 'oper' not in st or st['oper'] == 'desc' else False
            if st['field'] == 'datetime':
                if is_desc:
                    hzq = hzq.order_by(HzElecTail.timestamp.desc())
                else:
                    hzq = hzq.order_by(HzElecTail.timestamp)
            elif st['field'] == 'userId':
                if is_desc:
                    hzq = hzq.order_by(HzElecTail.user_id.desc())
                else:
                    hzq = hzq.order_by(HzElecTail.user_id)
            elif st['field'] == 'room':
                if is_desc:
                    hzq = hzq.order_by(HzElecTail.rail_no.desc())
                else:
                    hzq = hzq.order_by(HzElecTail.rail_no)
    else:
        hzq = hzq.order_by(HzElecTail.timestamp.desc())

    if page < 1:
        page = 1
    offset = (page - 1) * rows
    records = hzq.limit(rows).offset(offset).all()
    i = offset + 1
    rs = []
    for rec in records:
        rs.append({'id': rec.id, 'buildingId': rec.build_id, 'floorNo': rec.floor_no,
                   'x': rec.x, 'y': rec.y, 'status': rec.status,
                   'room': rec.rail_no,
                   'datetime': datetime.datetime.strftime(rec.timestamp, '%Y-%m-%d %H:%M:%S'),
                   'userId': rec.user_id, 'no': i})
        i += 1
    return jsonify({'errorCode': 0, 'msg': 'ok', 'data': {'total': total, 'rows': rs}})


@app.route('/lbs/electronic_rail_cfg_modify', methods=['POST'])
def electronic_rail_cfg_modify():
    """
    修改/新增电子围栏信息
    输入参数：
    {
        data: [{    信息内容
            id:     记录ID，新增时 ID可不填或者填 <=0 的数值。 修改时，必须返回记录ID。
                    若查询返回的围栏配置没有记录ID，则不允许修改。
            name:   电子围栏名称，不允许重复
            buildingId:     建筑id，保留
            floorNo:        楼层号
            points:[{   围栏顶点坐标。（坐标应符合连续逆时针或者顺时针的顺序。当前要求：按逆时针顺序）
                        可选参数。 当修改记录时，不涉及顶点修改，可以不传递。其他情况（新增，修改顶点）都需要
                        传递最终状态的完整顶点信息。
                x:  横坐标，物理坐标，单位 毫米 mm
                y:  纵坐标，物理坐标，单位 mm
            }]
        }]
    }
    :return:
    {
        errorCode   错误码
            == 0    成功
            == 100  [data] field required.
            == 101  输入参数错误
            == 102  围栏[%s]已经存在！ (重复添加)
            == 103  ID为[%d]的电子围栏不存在！ (修改id不存在的电子围栏)
            == 104  修改后的围栏名称[%s]和现有的重名！
            == 105  围栏顶点数须大于等于3！
        msg         错误信息
            == 'ok' 成功提示
    }
    """

    if 'data' not in request.form:
        return jsonify({'errorCode': 100, 'msg': '[data] field required.'})

    try:
        obj = json.loads(request.form['data'])
        for rec in obj:
            if 'id' not in rec or rec['id'] <= 0:
                """ 新增围栏配置，查询是否有重复记录 """
                et = HzElecTailCfg.query.filter_by(name=rec['name']).first()
                if et is not None:
                    return jsonify({'errorCode': 102, 'msg': u'围栏[%s]已经存在！' % rec['name']})
                if 'buildingId' not in rec:
                    rec['buildingId'] = HZ_BUILDING_ID
                et = HzElecTailCfg(rec)
                db.session.add(et)
                et = HzElecTailCfg.query.filter_by(rail_no=et.rail_no).first()

                """ 增加围栏顶点配置 """
                if len(rec['points']) < 3:
                    return jsonify({'errorCode': 105, 'msg': u'围栏顶点数须大于等于3！'})
                for vt in rec['points']:
                    etp = HzEtPoints(et_id=et.id, x=vt['x'], y=vt['y'])
                    db.session.add(etp)
            else:
                """ 更新电子围栏 """
                et = HzElecTailCfg.query.get(rec['id'])
                if et is None:
                    return jsonify({'errorCode': 103, 'msg': u'ID为[%d]的电子围栏不存在！' % rec['id']})

                """ 判断修改后的围栏名称是否和已有的重名 """
                records = HzElecTailCfg.query.filter_by(name=rec['name']).all()
                for r in records:
                    if r.id == rec['id']:
                        continue
                    return jsonify({'errorCode': 104, 'msg': u'修改后的围栏名称[%s]和现有的重名！' % rec['name']})
                et.update(rec)
                db.session.add(et)

                if 'points' in rec and rec['points'] is not None:
                    HzEtPoints.query.filter_by(et_id=rec['id']).delete()
                    """ 增加围栏顶点配置 """
                    if len(rec['points']) < 3:
                        return jsonify({'errorCode': 105, 'msg': u'围栏顶点数须大于等于3！'})
                    for vt in rec['points']:
                        etp = HzEtPoints(et_id=rec['id'], x=vt['x'], y=vt['y'])
                        db.session.add(etp)
    except KeyError:
        return jsonify({'errorCode': 101, 'msg': u'输入参数错误！'})

    db.session.commit()
    hz_update_et_cfg()
    return jsonify({'errorCode': 0, 'msg': u'更新成功！'})


@app.route('/lbs/hz_data_del', methods=['POST'])
def lbs_hz_data_del():
    """
    通用删除入口
    输入参数：
    {
        who:        要删除的模块。字符串
            == 'elect_rail_cfg'     电子围栏配置
            == 'people_stat_cfg'    盘点区域配置
            == 'people_stat_result' 盘点记录
            == 'people_stat_job'    定时盘点任务
        ids: [id1, id2, ...]    记录 id list
    }
    :return:
    {
        errorCode   错误码
            == 0    成功
            == 101  输入参数错误！
            == 202  未知模块[ %s ]
        msg         错误信息
            == [%d]个围栏，[%d]个顶点信息被删除。 (errorCode = 0 时)
    }
    """
    try:
        ids = request.json['ids']
        who = request.json['who']
        if who == 'elect_rail_cfg':
            return electronic_rail_cfg_del(ids)
        elif who == 'people_stat_cfg':
            return jsonify(ps.del_zones(ids))
        elif who == 'people_stat_result':
            return jsonify(ps.del_stat_results(ids))
        elif who == 'people_stat_job':
            return jsonify(ps.del_jobs(ids))
        else:
            return jsonify({'errorCode': 202, 'msg': u'未知模块[ %s ]' % who})

    except KeyError:
        return jsonify({'errorCode': 101, 'msg': u'输入参数错误！'})


def electronic_rail_cfg_del(ids):
    """
    删除电子围栏配置
    :param ids:
    :return:
    """
    vt = 0
    for i in ids:
        vt += HzEtPoints.query.filter_by(et_id=i).delete()  # 删除顶点坐标

    """ 删除 电子围栏 基本信息 """
    num = 0
    num += HzElecTailCfg.query.filter(HzElecTailCfg.id.in_(ids)).delete(synchronize_session=False)

    db.session.commit()
    hz_update_et_cfg()
    return jsonify({'errorCode': 0, 'msg': u'[%d]个围栏，[%d]个顶点信息被删除。' % (num, vt)})


def hz_update_et_cfg():
    from hzlbs.hzglobal import g_print_et_cfg

    new_cfg = {}
    cfgs = HzElecTailCfg.query.all()
    for cf in cfgs:
        ets = HzEtPoints.query.filter_by(et_id=cf.id).all()
        points = []
        for pt in ets:
            points.append({'x': pt.x, 'y': pt.y})
        new_cfg[cf.name] = points
    g_upd_et_cfg(new_cfg)

    g_print_et_cfg()


@app.route('/api/hz_lbs/WebLocate/locateResults', methods=['POST'])
def api_hz_lbs_locate_results():
    """
    查询位置信息，for windows
    :return:
    """
    from hzlbs.hzglobal import HZ_ACCESS_TOKEN

    obj = request.json
    token = obj['accessToken']
    uids = obj['userIds']

    if token != HZ_ACCESS_TOKEN:
        return jsonify({'errorCode': 600, 'errorMsg': u'Invalid access token.'})
    locs = HzLocation.query.filter(HzLocation.user_id.in_(uids)).group_by(HzLocation.user_id)\
        .order_by(HzLocation.id.desc()).all()
    data = []
    for lo in locs:
        data.append({'buildId': lo.build_id, 'floorNo': lo.floor_no, 'userId': lo.user_id,
                     'xMillimeter': lo.x, 'yMillimeter': lo.y,
                     'time': datetime.datetime.strftime(lo.timestamp, '%Y-%m-%d %H:%M:%S')})

    return jsonify({'errorCode': 0, 'errorMsg': [], 'data': data, 'valid': True})
