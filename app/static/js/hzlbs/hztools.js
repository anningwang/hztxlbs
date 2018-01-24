/**
 * 和仲通讯 版权所有 2016-2018
 * 版本号：v0.3
 * 地图公用函数定义
 * 
 * Requires: socket.io.min.js
 *           jquery.gritter.js & jquery.gritter.css
 */


'use strict';

(function(window){

    var HZ_ZOOM = 0.386;                        // 地图缩放级别
    var HZ_DESTINATION_MEETING_ROOM = 27;       // 办公室编号
    var HZ_USER_ID_DEFAULT = '1918E00103AA';    // 默认导航用户，容错处理

    function HzTools() {
        this.zoom = HZ_ZOOM;
        this.dest = HZ_DESTINATION_MEETING_ROOM;
        this.is_navigating = false;
        this.navUserId = undefined;
        this.selectUserId = undefined;
        this._storage = window.localStorage;

        this._init();
    }

    HzTools.prototype = {
        constructor:HzTools,
        
        _init: function () {
            if(this._storage) {
                this.zoom = this.getZoom();
                this.dest = this.getDestination();
                this.is_navigating = this.getNavStatus();
                this.navUserId = this.getNavUserId();
                this.selectUserId = this.getSelectUserId();
            }
        },
        getZoom: function () {
            return this._storage.getItem('hz_zoom') ||  HZ_ZOOM;
        },
        setZoom: function (zoom) {
            this.zoom = zoom;
            if(this._storage)  this._storage['hz_zoom'] = this.zoom;
        },
        getNavStatus: function () {
            return this._storage.getItem('hz_is_navigating') == 'true';
        },
        setNavStatus: function (status) {
            this.is_navigating = status;
            if(this._storage) this._storage['hz_is_navigating'] = this.is_navigating;
        },
        setDestination: function (dest) {
            this.dest = parseInt(dest);
            if(this._storage) this._storage['hz_destination'] = this.dest;
        },
        getDestination: function () {
            return this._storage.getItem('hz_destination')|| HZ_DESTINATION_MEETING_ROOM;
        },
        setNavUserId: function (userId) {
            this.navUserId = userId;
            if(this._storage) this._storage['hz_nav_userId'] = this.navUserId;
        },
        getNavUserId: function () {
            return this._storage.getItem('hz_nav_userId') || HZ_USER_ID_DEFAULT;
        },
        setSelectUserId: function (userId) {
            this.selectUserId = userId;
            if(this._storage) this._storage['hz_select_userId'] = this.selectUserId;
        },
        getSelectUserId: function () {
            return this._storage.getItem('hz_select_userId');
        }
    };

    window.HzTools = new HzTools();
})(window);


var hz_namespace = '/HeZhong';
// Connect to the Socket.IO server.
// The connection URL has the following format:
//     http[s]://<domain>:<port>[/<namespace>]
var hz_connStr = location.protocol + '//' + document.domain + ':' + location.port + hz_namespace;


//-----------------------------------------------------------------------------
// Init对象功能 begin
//-----------------------------------------------------------------------------

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

//-----------------------------------------------------------------------------
// Init对象功能 end
//-----------------------------------------------------------------------------


//-----------------------------------------------------------------------------
// 画区域对象功能 begin
//-----------------------------------------------------------------------------
function HzDrawZone(options) {
    options = options || {};

    // 坐标格式 [[x,y], ...]
    this.points = [];
    // 操作事件的对象(jquery)
    this.$event = options.event || $('#enclosureEvent');
    // 临时线函数
    this.$svg_temporary_line = this.$event;

    // 画板对象(jquery)
    this.$board = options.board || $('#svg-electronic-rail-draft');
    this.$board.svg();
    this.$board_svg = this.$board.svg('get');
    // 地图对象
    this.$map = $('#svg_image');
    this.baseLayer = options.baseLayer || $('#svg_map_base');
    this.penColor = options.penColor || 'red';


    // 鼠标移动坐标
    this.mousemove_points = [];
    // 直角是否启动判断键值
    this.right_angle_key = 17;		// Ctrl 键
    // demo坐标位置
    this.dotted_line = [];

    // 是否是斜线判断
    this.is_coordinate_offset = false;
    // 需要的html对象
    this.htmlObj = {
        // 画线开始图标
        line_start: '#line_start'
        // line_switch: '#btnDrawAddEr'
    };
    // 线样式
    this.line_style = {
        // 演示线样式
        demo_line: {fill: 'none', stroke: this.penColor, strokeWidth: 1},
        // 实际线样式
        result_line: {fill: 'none', stroke: this.penColor, strokeWidth: 4}
    };
    // 热点大小
    this.hotspot_size = {
        width: 20,
        height: 20
    };
    // 移动需要画的虚线
    this.spot_move_line = [];
    // 热点 线坐标
    this.hotspot_new_position = [];

    /**
     * 移除事件绑定
     * param
     */
    this.remove_event = function (isClearBoard, is_enclosureEvent_display) {
        // 默认清除画板
        isClearBoard = (isClearBoard !== false);
        is_enclosureEvent_display = (is_enclosureEvent_display !== false);

        if(is_enclosureEvent_display) this.$event.css('display', 'none');

        $(window).off('keydown', this.right_angle_package);
        $(window).off('keyup', this.keyup_fn);
        this.$event.off('click', this.line_click_package);
        this.$event.off('mousemove', this.mousemove_line_package);

        $(this.htmlObj.line_start).off('click', this.line_end);

        // 清除线
        this.svgPolyline([], {}, this.$svg_temporary_line);
        // 是否清除画板线
        if(isClearBoard) {
            this.svgPolyline([], {}, this.$board);
            this.baseLayer.find('.enclosure_spot').remove();
        }

        $(this.htmlObj.line_start).css({left: 0, top: 0, display: 'none'});
    };
    // 围栏绘制功能入口
    this.polyline = function () {
        var _this = this;
        this.points = [];
        this.is_coordinate_offset = false;
        this.$event.css('display', 'block');        // 显示事件绑定div

        $(window).on('keydown', {_this: _this}, this.right_angle_package);
        $(window).on('keyup', {_this: _this}, this.keyup_fn);
        this.$event.on('click', {_this: _this}, this.line_click_package);
        this.$event.on('mousemove', {_this: _this}, this.mousemove_line_package);
        $(this.htmlObj.line_start).on('click', {_this: _this}, this.line_end);
    };

    this.line_click_package = function (e) {
        e.data._this.line_click(e);
    };

    // 画线函数
    this.line_click = function (e) {
        var mapObjOffset = this.$map.offset();
        var map_path_line = [];
        map_path_line[0] = e.pageX - mapObjOffset.left - parseInt(this.$map.css('border-left-width'));
        map_path_line[1] = e.pageY - mapObjOffset.top - parseInt(this.$map.css('border-top-width'));

        if(this.points.length === 0) {
            var $line_start = $(this.htmlObj.line_start);
            var line_start_width = $line_start.outerWidth() / 2;
            var line_start_height = $line_start.outerWidth() / 2;

            $line_start.css({
                left: map_path_line[0] - line_start_width + 'px',
                top: map_path_line[1] - line_start_height + 'px',
                display: 'block'
            })
        }
        // 画直角线的情况  且不是第一个数据
        if(this.is_coordinate_offset && this.points.length !== 0) {
            if(this.dotted_line.length = 2) {
                this.points.push(this.dotted_line[1]);
            }
        }
        else {
            this.points.push(map_path_line);
        }

        var points_length = this.points.length;

        if(points_length > 1) this.create_hotspot(this.baseLayer, this.points[points_length - 1], points_length - 1);
        this.svgPolyline(this.points, this.line_style.result_line, this.$board);
        console.log('square_mouse_up', this.points);
    };

    // 按键抬起函数
    this.keyup_fn = function (e) {
        if(e.which === e.data._this.right_angle_key && e.data._this.mousemove_points.length > 1) {
            e.data._this.is_coordinate_offset = false;
            e.data._this.svgPolyline(e.data._this.mousemove_points, e.data._this.line_style.demo_line);
        }
    };

    // 直线函数包
    this.right_angle_package = function (e) {
        if(e.data._this.mousemove_points.length > 1 && e.which === e.data._this.right_angle_key) {
            // 是否直线函数判断  鼠标移动也直线函数
            e.data._this.is_coordinate_offset = true;
            e.data._this.right_angle(e.data._this.mousemove_points[1]);
        }
    };
    // 直线函数
    this.right_angle = function (new_points) {
        this.dotted_line[0] = this.points[this.points.length - 1];
        if(Math.abs(this.dotted_line[0][0] - new_points[0]) >= Math.abs(this.dotted_line[0][1] - new_points[1])) {
            this.dotted_line[1] = [new_points[0], this.dotted_line[0][1]];
        } else {
            this.dotted_line[1] = [this.dotted_line[0][0], new_points[1]];
        }
        this.svgPolyline(this.dotted_line, this.line_style.demo_line);
    };
    // 鼠标移动划线函数包
    this.mousemove_line_package = function (e) {
        if(e.data._this.points.length > 0) {
            e.data._this.mousemove_line(e);
        }
    };
    // 鼠标移动划线函数
    this.mousemove_line = function (e) {
        var mapOffset = this.$map.offset();
        this.mousemove_points[0] = this.points[this.points.length - 1];
        this.mousemove_points[1] = [
            e.pageX - mapOffset.left - parseInt(this.$map.css('border-left-width')),
            e.pageY - mapOffset.top - parseInt(this.$map.css('border-top-width'))
        ];
        if(this.is_coordinate_offset) {
            this.right_angle(this.mousemove_points[1]);
        } else {
            this.svgPolyline(this.mousemove_points, this.line_style.demo_line);
        }
    };
    // 围栏结束
    this.line_end = function (e) {
        var _this = e.data._this;
        var points_length = _this.points.length;

        // this 判定该函数的对象
        $(this).css({top: 0, left: 0, display: 'none'});

        if(points_length > 1) {
            _this.points.push(_this.points[0]);
            // 画热点
            _this.create_hotspot(_this.baseLayer, _this.points[points_length], _this.points.length - 1, true);
        }

        _this.svgPolyline(_this.points, _this.line_style.result_line, _this.$board);
        _this.remove_event(false, false);
    };

    // 画方框
    this.square = function () {
        // 打开事件绑定div
        this.$event.css('display', 'block');
        this.$event.on('mousedown', {_this: this}, this.square_mouse_down_package);
    };
    this.square_mouse_down_package = function (e) {
        var _this = e.data._this;
        _this.square_mouse_down(e);
        return false;
    };
    this.square_mouse_down = function (e) {
        // 第一个点
        var pt = [];
        var $map = this.$map;
        var mapOffset = $map.offset();
        this.points = [];

        pt[0] = e.pageX - mapOffset.left - parseInt($map.css('border-left-width'));
        pt[1] = e.pageY - mapOffset.top - parseInt($map.css('border-top-width'));
        this.points[0] = pt;
        $(window).on('mousemove', {_this: this}, this.square_mouse_move_package);
        $(window).on('mouseup', {_this: this}, this.square_mouse_up_package);
    };

    this.square_mouse_move_package = function (e) {
        var _this = e.data._this;
        _this.square_mouse_move(e);
    };
    this.square_mouse_move = function (e) {
        var $map = this.$map;
        var mapOffset = $map.offset();

        var x = e.pageX - mapOffset.left - parseInt($map.css('border-left-width'));
        var y = e.pageY - mapOffset.top - parseInt($map.css('border-top-width'));

        this.points[1] = [x, this.points[0][1]];
        this.points[2] = [x, y];
        this.points[3] = [this.points[0][0], y];
        this.points[4] = this.points[0];

        this.svgPolyline(this.points, this.line_style.demo_line, this.$svg_temporary_line);
    };

    this.square_mouse_up_package = function (e) {
        var _this = e.data._this;
        _this.square_mouse_up(e);
    };

    this.square_mouse_up = function (e) {
        this.svgPolyline([], {}, this.$svg_temporary_line);
        this.remove_hotspot();
        this.svgPolyline(this.points, this.line_style.result_line, this.$board);
        var $window = $(window);
        $window.off('mousemove', this.square_mouse_move_package);
        $window.off('mouseup', this.square_mouse_up_package);
        var points_length = this.points.length;
        if(points_length < 2) {
            this.points = [];
        } else {
            for(var i = 1; i < points_length; i++) {
                this.create_hotspot(this.baseLayer, this.points[i], i, i==(points_length - 1));
            }
        }
        console.log('square_mouse_up', this.points, 'e=', e);
    };

    /**
     *  创建热点
     * parent 			父div，JQuery对象
     * position 		坐标，[x, y]
     * index 			索引, 在points 中的位置
     * isEndPoint 		boolean 是否是尾点，默认 false
     */
    this.create_hotspot = function (parent, position, index, isEndPoint) {
        isEndPoint = isEndPoint || false;

        var left = position[0] - Math.round((this.hotspot_size.width) / 2);
        var top = position[1] - Math.round((this.hotspot_size.height) / 2);

        var hotspot = $("<div></div>")
            .addClass('enclosure_spot')
            .attr('index', index);

        // 创建尾点标记
        if(isEndPoint) hotspot.attr('isEndPoint', 1);

        hotspot.css({
            left: left + 'px',
            top: top + 'px'
        });

        hotspot.on('mousedown', {_this: this}, this.hotspot_mouse_down_package);
        parent.append(hotspot);
    };

    this.hotspot_mouse_down_package = function (e) {
        var _this = e.data._this;
        _this.hotspot_mouse_down(e, this);
        return false;
    };
    this.hotspot_mouse_down = function (e, obj) {
        // 事件
        var $this = $(obj);
        var current_spot_index = parseInt($this.attr('index'));

        // 实线数量
        var points_size = this.points.length;
        console.log('hotspot_mouse_down');

        $(window).on('mousemove', {
            _this: this,
            $obj: $this,
            current_spot_index: current_spot_index,
            points_size: points_size
        }, this.hotspot_mouse_move_package);

        $(window).on('mouseup', {
            _this: this,
            $obj: $this,
            current_spot_index: current_spot_index,
            points_size: points_size
        }, this.hotspot_mouse_up_package);
    };

    this.hotspot_mouse_move_package = function (e) {
        var _this = e.data._this;
        _this.hotspot_mouse_move(e);

    };
    this.hotspot_mouse_move = function (e) {
        console.log('hotspot_mouse_move');
        // 当前点下的元素
        var $obj = e.data.$obj;
        var current_spot_index = e.data.current_spot_index;
        var points_size = e.data.points_size;
        var mapObjOffset = this.$map.offset();

        var map_path_line1 = [];
        map_path_line1[0] = e.pageX - mapObjOffset.left - parseInt(this.$map.css('border-left-width'));
        map_path_line1[1] = e.pageY - mapObjOffset.top - parseInt(this.$map.css('border-top-width'));

        $obj.css({
            left: (map_path_line1[0] - Math.round((this.hotspot_size.width) / 2)) + 'px',
            top: (map_path_line1[1] - Math.round((this.hotspot_size.height) / 2)) + 'px'
        });

        // 线位置
        if($obj.attr('isEndPoint') != 1) { // 不是尾点的情况
            if(points_size > 1) {
                // 大于一个点  才需要划线
                this.spot_move_line[0] = this.points[current_spot_index - 1];
                this.spot_move_line[1] = map_path_line1;
                this.hotspot_new_position = map_path_line1;
                if(current_spot_index < (points_size - 1) && points_size > 2) this.spot_move_line[2] = this.points[current_spot_index + 1];
                this.svgPolyline(this.spot_move_line, this.line_style.demo_line, this.$svg_temporary_line);
            } else {
                this.hotspot_new_position = map_path_line1;
            }
        } else {
            if(points_size > 1) {
                // 大于一个点  才需要划线
                this.spot_move_line[0] = this.points[1];
                this.spot_move_line[1] = map_path_line1;
                this.hotspot_new_position = map_path_line1;
                if(points_size > 2) this.spot_move_line[2] = this.points[current_spot_index - 1];
                this.svgPolyline(this.spot_move_line, this.line_style.demo_line, this.$svg_temporary_line);
            } else {
                this.hotspot_new_position = map_path_line1;
            }
        }
    };
    this.hotspot_mouse_up_package = function (e) {
        var _this = e.data._this;
        _this.hotspot_mouse_up(e);
    };
    this.hotspot_mouse_up = function (e) {
        console.log('hotspot_mouse_up');
        var $obj = e.data.$obj;
        var current_spot_index = e.data.current_spot_index;

        this.svgPolyline([], {}, this.$svg_temporary_line);

        // 不是尾点的情况
        if($obj.attr('isEndPoint') != 1) {
            this.points[current_spot_index] = this.hotspot_new_position;
        } else {
            this.points[current_spot_index] = this.hotspot_new_position;
            this.points[0] = this.hotspot_new_position;
        }

        console.log('this.spot_move_line[1]', this.spot_move_line[1]);
        $(window).off('mousemove', this.hotspot_mouse_move_package);
        this.svgPolyline(this.points, this.line_style.result_line, this.$board);
        console.log('spot_mouse_up', this.points);

        this.hotspot_new_position = [];
        this.spot_move_line = [];
        $(window).off('mouseup', this.hotspot_mouse_up_package);
    };

    this.remove_hotspot = function () {
        this.baseLayer.find('.enclosure_spot').remove();
    };

    this.remove_square = function () {
        this.$event.css('display', 'none');
        this.$event.off('mousedown', this.square_mouse_down_package);
        this.$board_svg.clear();
        this.remove_hotspot();
    };

    /**
     *  画曲线函数	svgPolyline
     *  输入参数：
     *  	points		曲线坐标数组 [[x,y], ...]
     *  	param		曲线线型 line style， 默认为 this.line_style.result_line
     *  	obj			svg对象，曲线所在画图对象。
     *  	is_clear	是否清除原画布，再画新曲线。 默认 为 true
     */
    this.svgPolyline = function (points, param, obj, is_clear) {
        var settings = param || this.line_style.result_line;
        obj = obj || this.$svg_temporary_line;
        is_clear = (is_clear !== false);
        obj.svg();
        var svg = obj.svg('get');
        if(is_clear) svg.clear();
        if(points.length !== 0) svg.polyline(points, settings);
    }
}

//-----------------------------------------------------------------------------
// 画区域对象功能 end
//-----------------------------------------------------------------------------


String.prototype.format = function(args) {
    var _dic = typeof args === "object" ? args : arguments;
    // 如果 args 不是对象，那就是数组了，虽然arguments是伪数组，但不需要用到数组方法。

    return this.replace(/{([^}]+)}/g, function(str, key) { // 替换 {任何字符} 这样的字符串
        return _dic[key] || str;    // 如果在 _dic 找不到对应的值，就返回原字符
    });
};


//-----------------------------------------------------------------------------
// 查询服务器功能接口 begin
//-----------------------------------------------------------------------------

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
        if (opts.showMsg) {
            hzInfo(data.msg);
        }
        if (opts.callback && data.errorCode == 0) {
            opts.callback(data);
        }
    }).fail(function(qXHR, textStatus, errorThrown) {
        var msg = "请求失败。错误码：{0}({1})".format(jqXHR.status, errorThrown);
        hzInfo(msg);
    });
}

/**
 * 查询历史轨迹
 */
function getHistoryLocation(options) {
    var url = '/lbs/get_history_location';
    var txData = {
        "userId": options.userId,               // "userId": ["all"] for all users
        "datetimeFrom": options.datetimeFrom,   // 按照时间段查询
        "datetimeTo": options.datetimeTo,
        "compress": false,
        'page': options.page || 1,
        'rows': options.rows || 300
    };

    ajaxFormRequest({
        url: url,
        txData: txData,
        callback: options.callback
    });
}

/**
 * 查询电子围栏配置
 */
function getElectronicRailCfg(options) {
    options = options || {};
    var url = '/lbs/get_electronic_rail_cfg';
    var txData = {
        "floorNo": options.floorNo || 'floor3'
    };
    ajaxFormRequest({
        url: url,
        txData: txData,
        callback:options.callback
    });
}


/**
 * 查询 盘点区域 配置
 */
function getPeopleStatZoneCfg(options) {
    options = options || {};
    var url = '/lbs/people_stat_cfg_get';
    var txData = {
        floorNo: options.floorNo || 'Floor3',
        page: options.page || 1,
        rows: options.rows || 200
    };
    ajaxJsonRequest({
        url: url,
        txData: txData,
        callback:options.callback
    });
}



// ajax 方式 从服务器获取数据。 ContentType: application/x-www-form-urlencoded
function ajaxFormRequest(options) {
    $.ajax({
        url: options.url,
        async: true,        // 异步请求
        type: 'POST',
        ContentType:'application/x-www-form-urlencoded;charset=utf-8',  // default type
        data: {data: JSON.stringify(options.txData)}        // 将json数据作为 value 发送到服务器
    }).done(function(data) {
        if(data.errorCode == 0) {
            if (options.callback){ options.callback(data);  }
        } else {
            hzInfo('接口调用失败：' + data.msg);
        }
    }).fail(function(jqXHR, textStatus, errorThrown) {
        var msg = "请求失败。错误码：{0}({1})".format(jqXHR.status, errorThrown);
        hzInfo(msg);
    });
}

// ajax 方式 从服务器获取数据。 ContentType: application/json
function ajaxJsonRequest(options) {
    $.ajax({
        url: options.url,
        async: true,        // 异步请求
        type: 'POST',
        contentType: "application/json;charset=UTF-8",
        data: JSON.stringify(options.txData)    // 发送json数据到服务器
    }).done(function(data) {
        if(data.errorCode == 0) {
            if (options.callback){ options.callback(data);  }
        } else {
            hzInfo('接口调用失败：' + data.msg);
        }
    }).fail(function(jqXHR, textStatus, errorThrown) {
        var msg = "请求失败。错误码：{0}({1})".format(jqXHR.status, errorThrown);
        hzInfo(msg);
    });
}

//-----------------------------------------------------------------------------
// 查询服务器功能接口 end
//-----------------------------------------------------------------------------

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
