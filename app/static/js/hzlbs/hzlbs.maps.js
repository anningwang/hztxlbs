'use strict';

function CoordTransformer()
{
    var _locOrigin;
    var _locRange;

    var _mapOrigin;
    var _mapAxisX;
    var _mapAxisY;
    var _mapRange;

    this.getVectorLen = function(vector) {
        return Math.sqrt(vector.x*vector.x + vector.y*vector.y);
    };

    this.init = function(locOrigin,locRange,mapParas) {
        if(mapParas.length != 4)
            return false;

        _locOrigin = locOrigin;
        _locRange = locRange;

        _mapOrigin = mapParas[0];
        _mapAxisX = {'x':mapParas[1].x - mapParas[0].x ,'y':mapParas[1].y - mapParas[0].y};
        _mapAxisY = {'x':mapParas[3].x - mapParas[0].x ,'y':mapParas[3].y - mapParas[0].y};
        _mapRange = {'x':this.getVectorLen(_mapAxisX),'y':this.getVectorLen(_mapAxisY)};

        // 向量单位化
        _mapAxisX.x /= _mapRange.x; _mapAxisX.y /= _mapRange.x;
        _mapAxisY.x /= _mapRange.y; _mapAxisY.y /= _mapRange.y;

    };

    this.transform = function(loc)
    {
        var offsetRatio = {'x':(loc.x-_locOrigin.x)/_locRange.x,'y':(loc.y-_locOrigin.y)/_locRange.y};

        var mapOffset = {'x':offsetRatio.x*_mapRange.x,'y':offsetRatio.y*_mapRange.y};
        var mapCoord = {'x':_mapOrigin.x+_mapAxisX.x*mapOffset.x+_mapAxisY.x*mapOffset.y,
            'y':_mapOrigin.y+_mapAxisX.y*mapOffset.x+_mapAxisY.y*mapOffset.y};

        return mapCoord;
    };

}

var _transformer = new CoordTransformer();

var _locOrigin = {'x':0,'y':0};          // 定位坐标原点
var _locRange = {'x':39023,'y':19854};   // 定位范围

// 根据定位四个角点的地图坐标点
var _mapParas = [];
_mapParas[0]={'x':12531716.588,'y':3101762.0606};    // 定位原点地图坐标
_mapParas[1]={'x':12531760.942,'y':3101762.0606};    // X轴终点地图坐标
_mapParas[2]={'x':12531760.942,'y':3101784.7414};    // 定位原点对角点地图坐标
_mapParas[3]={'x':12531716.588,'y':3101784.7414};    // Y轴终点地图坐标

// 转换器初始化
_transformer.init(_locOrigin, _locRange, _mapParas);


/**
 * 将平面坐标 转换为 墨卡托 投影坐标，用于FMap上的定位
 * @param coord         要转换的平面坐标 {x: 100, y: 200}
 * 返回值，转换后的坐标对象 {x: v1, y: v2}
 */
function hzTransformToFMap(coord) {
    return _transformer.transform(coord);
}




// need socket.io.min.js
var hz_namespace = '/HeZhong';
// Connect to the Socket.IO server.
// The connection URL has the following format:
//     http[s]://<domain>:<port>[/<namespace>]
var hz_connStr = location.protocol + '//' + document.domain + ':' + location.port + hz_namespace;
