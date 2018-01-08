/**
 * 和仲通讯 版权所有 2016-2018
 * 版本号：v0.3
 * 地图公用函数定义
 */

'use strict';


// need socket.io.min.js
var hz_namespace = '/HeZhong';
// Connect to the Socket.IO server.
// The connection URL has the following format:
//     http[s]://<domain>:<port>[/<namespace>]
var hz_connStr = location.protocol + '//' + document.domain + ':' + location.port + hz_namespace;


// 初始化对象
function Init(){
    // 存运行函数的清除方法
    this.stopFn = [];
}

/**
 * 添加格式
 * 1. (函数)
 * 2. (对象,函数)
 * 3. (函数,参数)
 * 4. (对象,函数,参数)    (obj,fn,[param1,param2])
 */
Init.prototype.add = function(){
    var args = [].slice.call(arguments);
    this.stopFn.push(args);
};

Init.prototype.empty = function(){
    this.stopFn = [];
};

Init.prototype.run = function(){
    var current_item;
    while(current_item = this.stopFn.pop()){
        this.distribution(current_item);
    }
};

Init.prototype.distribution = function(param){
    var param_length = param.length;
    switch (param_length){
        case 0:
            param();
            break;
        case 1:
            param[0]();
            break;
        case 2:
            this.stopFn_param_2(param[0],param[1]);
            break;
        case 3:
            this.stopFn_param_3(param[0],param[1],param[2]);
            break;
    }
};

Init.prototype.stopFn_param_2 = function(param1,param2){
    console.log('param1',param2);
    if(typeof param1 === 'function'){
        if(param2 instanceof Array)
        {
            param1.apply(window,param2);
            console.log('stopFn_param_2',window);
        }else{
            param1.apply(window,[param2]);
        }
    }else{
        param2.apply(param1);
    }
};

Init.prototype.stopFn_param_3 = function(param1,param2,param3){
    if(param3 instanceof Array)
    {
        param2.apply(param1,param3);
    }else{
        param2.apply(param1,[param3]);
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
