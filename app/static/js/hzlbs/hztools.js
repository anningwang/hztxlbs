/**
 * 和仲通讯 版权所有 2016-2018
 * 版本号：v0.3
 * 地图公用函数定义
 * 
 * Requires: socket.io.min.js
 *           jquery.gritter.js & jquery.gritter.css
 */

'use strict';


var hz_namespace = '/HeZhong';
// Connect to the Socket.IO server.
// The connection URL has the following format:
//     http[s]://<domain>:<port>[/<namespace>]
var hz_connStr = location.protocol + '//' + document.domain + ':' + location.port + hz_namespace;


/**
 * 添加格式
 * 1. (函数)                    add(fn)
 * 2. (对象,函数)               add(obj, fn)
 * 3. (函数,参数)               add(fn, param)
 * 4. (对象,函数,参数)          add(obj,fn,[param1,param2])
 */
function Init(){
    // 存运行函数的清除方法
    this.stopFn = [];
}

Init.prototype.add = function(){
    var args = [].slice.call(arguments);
    this.stopFn.push(args);
};

Init.prototype.empty = function(){
    this.stopFn = [];
};

Init.prototype.run = function(){
    var param;
    while(param = this.stopFn.pop()){
        this.dispatch(param);
    }
};

Init.prototype.dispatch = function(param){
    switch (param.length){
        case 1:
            param[0].call(null);
            break;
        case 2:
            if(typeof param[0] === 'function') {
                this.func_param(param[0],param[1]);
            } else {
                this.obj_func(param[0],param[1]);
            }
            break;
        case 3:
            this.obj_func_param(param[0],param[1],param[2]);
            break;
    }
};

Init.prototype.func_param = function(func,param) {
    if(param instanceof Array) {
        func.apply(window,param);
    }else{
        func.apply(window,[param]);
    }
};

Init.prototype.obj_func = function(obj,func) {
    func.apply(obj);
};


Init.prototype.obj_func_param = function(obj,func,param){
    if(param instanceof Array) {
        func.apply(obj,param);
    }else{
        func.apply(obj,[param]);
    }
};


/**
 * 立即盘点
 * @param opts      object  { showMsg: boolean, 是否显示提示框
 *                             callback: function, 回调函数
 *                             }
 */
function psExec(opts) {
    var url = '/lbs/people_stat_do';
    var txData = {};

    $.ajax({
        url: url,
        async: true,        // 异步请求
        type: 'POST',
        contentType: "application/json;charset=UTF-8",
        data: JSON.stringify(txData)    // 发送json数据到服务器
    }).done(function(data) {
        console.log('接口调用成功');
        console.log('receive:', data);
        if (opts.showMsg) {
            alert(data.msg);
        }

        if (opts.callback && data.errorCode == 0) {
            opts.callback(data);
        }

    }).fail(function() {
        console.log('接口调用失败');
    });
}

/**
 * 告警提示信息
 * @param title         标题
 * @param text          内容
 * @returns {boolean}
 */
function gritter_alert(title, text) {
    $.gritter.add({
        title: title,
        text: text,
        class_name: 'gritter-warning',
        image: '/static/img/blueImageMarker.png',
        sticky: true,
        time: ''
    });
    return false;
}



// 坐标转换 简化公式
var _locOrigin = {'x':0,'y':0};          // 定位坐标原点
var _locRange = {'x':39023,'y':19854};   // 定位范围
var _mapOrigin = {'x':12531716.588,'y':3101784.7414};
var _mapRange = {'x':12531761.921,'y':3101761.9051};
function hzPlaneCoordToFMap(coord) {
    var x = (coord.x - _locOrigin.x)/ (_locRange.x - _locOrigin.x) * (_mapRange.x - _mapOrigin.x) + _mapOrigin.x;
    var y = (coord.y - _locOrigin.y) / (_locRange.y - _locOrigin.x) * (_mapRange.y - _mapOrigin.y) + _mapOrigin.y;
    
    return {'x': x, 'y': y};
}
