/**
 * 和仲通讯 版权所有 2016-2018
 * 版本号：v0.3
 * 地图公用函数定义
 */

'use strict';

var zoom = 0.4889; // 地图缩放级别
var real_loc_to_pix = 0.0891; // 物理单位转像素单位比例, 比例转换计算公式x为传来的数据  px = x * real_loc_to_pix * zoom

// 像素坐标转物理坐标
function coordScreenToMap(px) {
    return Math.round(px / real_loc_to_pix / zoom);
}

// 物理坐标（单位：mm）转屏幕坐标（单位：像素）
function coordMapToScreen(mm) {
    return parseInt(mm * real_loc_to_pix * zoom)
}

// 房间名称所在坐标
var roomNameCoord = [
    {name: '会议室',      x: 2067,  y: 3563,  fontSize: 20},
    {name: '副总办公室',  x: 2067,  y: 8981,  fontSize: 20},
    {name: '总裁室',      x: 2067,  y: 15609, fontSize: 20},
    {name: '仓库1',       x: 7947,  y: 15609, fontSize: 20},
    {name: '仓库2',       x: 12046, y: 15609, fontSize: 20},
    {name: '大会议室',    x: 31148, y: 14433, fontSize: 20},
    {name: '智慧医疗',    x: 34569, y: 9587,  fontSize: 16},
    {name: '智慧园区',    x: 34309, y: 6486,  fontSize: 16},
    {name: '健身房',      x: 33678, y: 3101,  fontSize: 16},
    {name: '智慧安防',    x: 31000, y: 3101,  fontSize: 16},
    {name: '智慧消防',    x: 28403, y: 3101,  fontSize: 16},
    {name: '北斗羲和',    x: 25588, y: 3101,  fontSize: 16},
    {name: '机房',        x: 19244, y: 4775,  fontSize: 20},
    {name: '前台',        x: 19244, y: 7456,  fontSize: 20}
];

// 显示房间名称
function showRoomName(svg) {
    svg.clear();
    
    for(var i = 0; i < roomNameCoord.length; i++) {
        var str = 'translate(' + coordMapToScreen(roomNameCoord[i].x) + ',' + coordMapToScreen(roomNameCoord[i].y) + ')';
        var g1 = svg.group({
            transform: str
        });
        svg.text(g1, 0, 0, roomNameCoord[i].name, {
            fontSize: roomNameCoord[i].fontSize,
            fontFamily: 'Verdana',
            fill: 'blue'
        });
    }
}


// 移动标签位置到指定坐标 (x, y) 为屏幕坐标
function hzPeopleGoto(x, y, people) {
    people = people || '1918E00103AA'; // 设置默认参数
    // 24, 45是定位图标的 针尖 位置。显示图片时，是以图片左上角为参考坐标。故需要对坐标进行偏移。
    $("#" + people).stop(true, true).animate({
        left: (x - 24),
        top: (y - 45)
    });
}

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
