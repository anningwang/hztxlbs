
# coding=utf-8
import datetime

GEO_SCALE = 0.0891                  # 像素坐标(px) * 10 / 物理坐标(mm) = 89.1%
HZ_BUILDING_ID = "100159"           # 建筑ID
HZ_FLOOR_NO = "Floor3"              # 楼层号
g_hz = {'et_cfg': {}}       # 全局变量
HZ_ACCESS_TOKEN = 'you_never_guess@!#$~%'


def px2geo(pt):
    return int(pt / GEO_SCALE)


""" 工具函数 begin --------------------------------------------------------------------- """


def gen_code(tag, date=None):
    """
    生成编号。
    :param tag:             编号标识
    :param date:            日期，单据上附加日期信息
    :return:        生成的编号   例如电子围栏的编号：WL-171001-001(最后的001为该天的顺序号，有具体表格生成)
    """
    if date is None:
        date = datetime.datetime.today()
    data_str = datetime.datetime.strftime(date, '%y%m%d-')
    code_str = '%s-%s' % (tag, data_str)
    return code_str


def g_save_et_cfg(name, pts):
    if 'et_cfg' not in g_hz:
        g_hz['et_cfg'] = {}
    g_hz['et_cfg'][name] = pts


def g_del_et_cfg(name):
    if 'et_cfg' in g_hz and name in g_hz['et_cfg']:
        del g_hz[name]


def g_upd_et_cfg(cfgs):
    if 'et_cfg' not in g_hz:
        g_hz['et_cfg'] = {}
    g_hz['et_cfg'] = cfgs


def g_print_et_cfg():
    print g_hz
