'use strict';


var _locOrigin = {'x':0,'y':0};          // 定位坐标原点
var _locRange = {'x':39023,'y':19854};   // 定位范围

// 坐标转换 简化公式
var _mapOrigin = {'x':12531716.588,'y':3101784.7414};
var _mapRange = {'x':12531761.921,'y':3101761.9051};
function hzPlaneCoordToFMap(coord) {
    var x = (coord.x - _locOrigin.x)/ (_locRange.x - _locOrigin.x) * (_mapRange.x - _mapOrigin.x) + _mapOrigin.x;
    var y = (coord.y - _locOrigin.y) / (_locRange.y - _locOrigin.x) * (_mapRange.y - _mapOrigin.y) + _mapOrigin.y;
    
    return {'x': x, 'y': y};
}


// need socket.io.min.js
var hz_namespace = '/HeZhong';
// Connect to the Socket.IO server.
// The connection URL has the following format:
//     http[s]://<domain>:<port>[/<namespace>]
var hz_connStr = location.protocol + '//' + document.domain + ':' + location.port + hz_namespace;
