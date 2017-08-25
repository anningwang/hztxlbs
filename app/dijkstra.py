# coding=utf-8
import json
from config import FILENAME_VERTEX
from lbs import GEO_SCALE, CUR_MAP_SCALE


INT_MAX = 9999999
MAX = 100
rows = 100
cols = 100
hz_vertex = {}              # 格式： { 6 : {"pt_name":6, "x":1468.2507, "y":891},...}
hz_arc = []                 # 边 [[u1,v1], ... [ux,vx]]
matrix = [([INT_MAX] * cols) for r in range(rows)]           # 邻接矩阵
visited = [False] * MAX     # 标记数组
dist = [0] * MAX            # 源点到顶点i的最短距离
path = [0] * MAX            # 记录最短路的路径
vertex_num = 0              # 顶点数
arc_num = 0                 # 弧数


def dijkstra(source):
    for i in range(MAX):
        visited[i] = False      # 标记数组
    visited[source] = True
    for i in range(vertex_num):
        dist[i] = matrix[source][i]
        path[i] = source

    min_cost_index = 0      # 权值最小的下标
    for i in range(1, vertex_num):      # 找到源点到另外vertex_num-1个点的最短路径
        min_cost = INT_MAX      # 权值最小
        for j in range(vertex_num):
            if not visited[j] and dist[j] < min_cost:       # 找到权值最小节点
                min_cost = dist[j]
                min_cost_index = j

        visited[min_cost_index] = True      # 该点已找到，进行标记

        for j in range(vertex_num):     # 更新dist数组
            # 确保两点之间有弧
            if not visited[j] and matrix[min_cost_index][j] != INT_MAX \
                    and matrix[min_cost_index][j] + min_cost < dist[j]:
                dist[j] = matrix[min_cost_index][j] + min_cost
                path[j] = min_cost_index


def load_pos():
    # 设置以utf-8解码模式读取文件，encoding参数必须设置，否则默认以gbk模式读取文件，当文件中包含中文时，会报错
    file_obj = open(FILENAME_VERTEX, "r")
    setting = json.load(file_obj)
    global vertex_num, arc_num, matrix
    vertex_num = setting['vertex_num']
    arc_num = setting['arc_num']
    for i in range(vertex_num):
        for j in range(vertex_num):
            matrix[i][j] = INT_MAX

    for arc in setting['arc_info']:
        matrix[arc['v1']][arc['v2']] = arc['arc_weight'] + 44
        matrix[arc['v2']][arc['v1']] = arc['arc_weight'] + 44
        hz_arc.append([arc['v1'], arc['v2']])

    # print len(hz_arc),  hz_arc

    for v in setting['ver_list']:
        hz_vertex[v['pt_name']] = v

    file_obj.close()
    return vertex_num


def min_dist(pt_from):
    dijkstra(pt_from)
    for i in range(vertex_num):
        if i != pt_from:
            val = [i]
            t = path[i]
            while t != pt_from:
                val.append(t)
                t = path[t]
            val.append(pt_from)
            val.reverse()
            print pt_from, "到", i, "最短距离是：", dist[i], "，路径是：", val

    return 0


def min_dist2(pt_from, pt_to):
    dijkstra(pt_from)
    ret_list = [pt_to]
    t = path[pt_to]
    while t != pt_from:
        ret_list.append(t)
        t = path[t]
    ret_list.append(pt_from)
    ret_list.reverse()

    # print pt_from, "到", pt_to, "最短距离是：", dist[pt_to], "，路径是：", ret_list
    return ret_list


def distance(x1, y1, x2, y2,):
    return ((x1 - x2) ** 2 + (y1 - y2) ** 2) ** 0.5


def get_nearest_vertex(px, py):
    ret_vertex = -1     # -1 表示失败。>=0 ，则为合法顶点
    dd = INT_MAX
    # print "len(hz_vertex)=", len(hz_vertex), hz_vertex
    # 去除12个房间内的坐标点
    for v in range(vertex_num - 12):
        d1 = distance(px, py, float(hz_vertex[v]['x'])/GEO_SCALE, float(hz_vertex[v]['y'])/GEO_SCALE)
        if d1 < dd:
            dd = d1
            ret_vertex = v

    return ret_vertex

load_pos()
