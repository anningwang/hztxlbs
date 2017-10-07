# coding=utf-8
import os
from xml.etree import ElementTree
from hzglobal import px2geo


def calc_coord_from_svg():
    cur_pwd = os.path.abspath('.')
    prev_dir = os.path.split(cur_pwd)[0]
    fn_dir = os.path.join(prev_dir, 'static/img/floor3_bak.svg')
    with open(fn_dir, 'r') as f:
        print f.read()


def get_path():
    cur_pwd = os.path.abspath('.')
    prev_dir = os.path.split(cur_pwd)[0]
    fn_dir = os.path.join(prev_dir, 'static/img/f_bak.svg')   # floor3_bak
    # print cur_pwd
    # print prev_dir
    # print fn_dir
    return fn_dir


if '__main__' == __name__:
    tree = ElementTree.parse(get_path())
    root = tree.getroot()

    OP = ['m', 'M', 'l', 'L', 'V', 'v', 'H', 'h', 'L', 'l', 'Z', 'z']

    rects = {'lobby-regular': {},
             'room1': {},
             'room4': {}
             }

    for rect in root.iter('{http://www.w3.org/2000/svg}rect'):
        key = rect.attrib['id']
        if key in rects:
            # print rect.attrib
            x = float(rect.attrib['x'])
            y = float(rect.attrib['y'])
            w = float(rect.attrib['width'])
            h = float(rect.attrib['height'])
            rects[key]['pxPts'] = [{'x': int(x), 'y': int(y)}, {'x': int(x), 'y': int(y+h)},
                                   {'x': int(x+w), 'y': int(y+h)}, {'x': int(x+w), 'y': int(y)}]

            rects[key]['geoPts'] = [{'x': px2geo(pt['x']), 'y': px2geo(pt['y'])} for pt in rects[key]['pxPts']]

    # paths = {'lobby': {'pxPts': [], 'geoPts': []}, 'hz_he': {'pxPts': [], 'geoPts': []}}
    paths = {'hz_he': {'pxPts': [], 'geoPts': []}}
    for path in root.iter('{http://www.w3.org/2000/svg}path'):
        key = path.attrib['id']
        if key in paths:
            # print path.attrib['d']
            L = path.attrib['d'].split()
            # print L
            x, y = 0, 0
            op = ''
            for i in range(len(L)):
                if L[i] in OP:
                    op = L[i]
                else:
                    if op == 'm' or op == 'M':
                        if ',' in L[i]:
                            coord = L[i].split(',')
                        else:
                            coord = L[i].split()
                        x = float(coord[0])
                        y = float(coord[1])
                        paths[key]['pxPts'].append({'x': x, 'y': y})
                    elif op == 'h':
                        x += float(L[i])
                        paths[key]['pxPts'].append({'x': x, 'y': y})
                    elif op == 'v':
                        y += float(L[i])
                        paths[key]['pxPts'].append({'x': x, 'y': y})
                    elif op == 'l':
                        coord = L[i].split(',')
                        x += float(coord[0])
                        y += float(coord[1])
                        paths[key]['pxPts'].append({'x': x, 'y': y})
                    elif op == 'z' or op == 'Z':
                        break
                    elif op == 'L':
                        coord = L[i].split(',')
                        paths[key]['pxPts'].append({'x': float(coord[0]), 'y': float(coord[1])})
                    else:
                        raise Exception('Unknown op[%s]' % op)
            paths[key]['geoPts'] = [{'x': px2geo(pt['x']), 'y': px2geo(pt['y'])} for pt in paths[key]['pxPts']]
    print paths
    # print rects
