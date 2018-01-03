
# coding=utf-8
import datetime

GEO_SCALE = 0.0891                  # 像素坐标(px) * 10 / 物理坐标(mm) = 89.1%
HZ_BUILDING_ID = "100159"           # 建筑ID
HZ_FLOOR_NO = "Floor3"              # 楼层号
TEST_UID = "1918E00103AA"           # 测试用标签UID
TEST_UID_2 = "1918E00103A9"         # 测试用标签UID
HZ_UID = [TEST_UID, TEST_UID_2]     # 用户标签id 表

HZ_ACCESS_TOKEN = 'you_never_guess@!#$~%'


def px2geo(pt):
    return int(pt / GEO_SCALE)


""" 工具函数 begin --------------------------------------------------------------------- """


def gen_code(tag, date=None):
    """
    生成编号。
    :param tag:     编号标识
    :param date:    日期，单据上附加日期信息
    :return:        生成的编号   例如电子围栏的编号：WL-171001-001(最后的001为该天的顺序号，由具体表格生成)
    """
    if date is None:
        date = datetime.datetime.today()
    data_str = datetime.datetime.strftime(date, '%Y%m%d-')
    code_str = '%s-%s' % (tag, data_str)
    return code_str


def gen_code_seconds(tag, date=None):
    """
    生成编号。
    :param tag:     编号标识
    :param date:    日期，单据上附加日期信息
    :return:        生成的编号   例如盘点编号：PD-171001-195700-001(最后的001为该天的顺序号，由具体表格生成)
    """
    if date is None:
        date = datetime.datetime.today()
    data_str = datetime.datetime.strftime(date, '%Y%m%d-%H%M%S')
    code_str = '%s-%s' % (tag, data_str)
    return code_str
