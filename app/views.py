# -*- coding:utf-8 -*-
from flask import render_template, flash, redirect, session, url_for, request, g, jsonify
from flask_login import login_user, logout_user, current_user, login_required
from flask_sqlalchemy import get_debug_queries
from flask_babel import gettext
from app import app, db, lm, oid, babel
from forms import LoginForm, EditForm, PostForm, SearchForm
from models import User, ROLE_USER, ROLE_ADMIN, Post, HzToken, HzLocation
from datetime import datetime
from emails import follower_notification
from guess_language import guessLanguage
from translate import microsoft_translate
from config import POSTS_PER_PAGE, MAX_SEARCH_RESULTS, LANGUAGES, DATABASE_QUERY_TIMEOUT
import random
from dijkstra import min_dist2, get_nearest_vertex, hz_vertex
from lbs import TEST_UID, CUR_MAP_SCALE, HZ_MAP_GEO_WIDTH, HZ_MAP_GEO_HEIGHT


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
        g.user.last_seen = datetime.utcnow()
        db.session.add(g.user)
        db.session.commit()
        g.search_form = SearchForm()
    g.locale = get_locale()


@app.after_request
def after_request(response):
    for query in get_debug_queries():
        if query.duration >= DATABASE_QUERY_TIMEOUT:
            app.logger.warning("SLOW QUERY: %s\nParameters: %s\nDuration: %fs\nContext: %s\n" % (query.statement, query.parameters, query.duration, query.context))
    return response


@app.errorhandler(404)
def internal_error(error):
    return render_template('404.html'), 404


@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return render_template('500.html'), 500


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
                    timestamp=datetime.utcnow(),
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

    return render_template('token.html',            # token.html     svgBasec.html
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
    user_id = request.form['userId']
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
