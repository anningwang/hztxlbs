/**
 * hztx map：v0.4
 *
 * 和仲通讯 版权所有 2016-2018
 * Created by WXG on 2018/1/11.
 *
 * Requires: jQuery 1.2.2+
 */


//var hzX = undefined, hzY = undefined;   // 地图在容器中的位置（距离左上角的距离，left, top）
// var real_loc_to_pix = 0.0891;  // 物理坐标转像素的比例，比例转换计算公式: px = mm * real_loc_to_pix * zoom
//var zoom = 0.486;       // 地图缩放级别
//var margin = 0;         //外边距
//var map_w = 3477;       // px
//var map_h = 1769;       // 地图图片高度

//var hz_is_navigating = false;           // 是否曾经设置过导航，或正在导航中
//var HZ_DESTINATION_MEETING_ROOM = 27;    // 办公室编号
//var hz_destination = HZ_DESTINATION_MEETING_ROOM;     // 导航的目的地，默认 第一个 目的地

//var hz_user_id = 0;   // 为HZ_USER_IDS 的索引-1， 0 表示 未选择用户
//var HZ_USER_IDS = ['1918E00103AA', '1918E00103A9'];
//var hz_user_xy = [];   // 用户数据  每项为一个用户，[['1918E00103AA',x,y], ...]
//var storage = window.localStorage;

(function(w) {

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

	function HzPeople(options) {
		this.id = options.id;
		this.text = options.text;
		this.x = options.x;
		this.y = options.y;
	}


	function HzMap(options) {
		this.container = options.container;     // JQuery 对象
		this.baseLayer = this.addLayer(this.container, 'svg_map_base');
		this.mapSvgLayer = this.addMapSvg(this.baseLayer, 'svg_image', '/static/img/floor3.svg');
		this.pathLayer = this.addLayer(this.baseLayer, 'svg_path');

		this.roomLayer = this.addLayer(this.baseLayer, 'svg_sign');
		this.userLayer = this.addLayer(this.baseLayer, 'svg_user_sign');
		this.eventLayer = this.addLayer(this.baseLayer, 'svg_event');   // mouse event: mouseup, mousedown, mousemove
		this.left = undefined;     // 地图在容器中的位置（距离左上角的距离，left, top）
		this.top = undefined;
		this.fator = 0.0891;  // 物理坐标转像素的比例
		(options.zoom !== undefined) ? this.zoom = options.zoom : 0.486;    // 地图缩放级别
		this.mapW = 3477;       // 地图图片宽度 px
		this.mapH = 1769;       // 地图图片高度 px
		this.userList = {};     // 用户列表 { userId: HzPeople }
		this.hz_user_xy = [];

		this.zoomCallBack = [];      // func Array 缩放需要执行的临时函数
	}

	HzMap.prototype = {
		constructor:HzMap,
		
		addLayer: function (parent, id) {
			parent.append('<div id=' + id + ' class="each_map_layer" />');
			return $('#'+id);
		},

		addMapSvg: function (parent, id, filepath) {
			parent.append('<img src="' + filepath +'" id=' + id + ' class="each_map_layer" />');
			return $('#'+id);
		},

		coordScreenToMap : function (px) {
			return Math.round(px / this.fator / this.zoom);
		},

		coordMapToScreen: function (mm) {
			return parseInt(mm * this.fator * this.zoom)
		},

		showRoomName: function () {     // 显示房间名称
			var roomLayer = this.roomLayer;
			roomLayer.svg();
			var svg = roomLayer.svg('get');

			if(!svg) {
				console.log('showRoomName svg param is null, svg=', svg );
				return false;
			}
			svg.clear();

			for(var i = 0; i < roomNameCoord.length; i++) {
				var str = 'translate(' + this.coordMapToScreen(roomNameCoord[i].x) + ',' + this.coordMapToScreen(roomNameCoord[i].y) + ')';
				var g1 = svg.group({
					transform: str
				});
				svg.text(g1, 0, 0, roomNameCoord[i].name, {
					fontSize: roomNameCoord[i].fontSize,
					fontFamily: 'Verdana',
					fill: 'blue'
				});
			}
		},

		mapZoom: function (height, width, left, top) {  // 缩放地图，并设置地图的位置（left, top）
			var $each_map_layer = $('.each_map_layer');

			var $svg_map_base = $('#svg_map_base');

			var mapOldW = $svg_map_base.outerWidth() / 2;
			var mapOldH = $svg_map_base.outerHeight() / 2;

			// 缩放 div 中 svg 的 宽和高
			$each_map_layer.each(function () {
				$(this).css({height: height+'px', width: width+'px'});

				var divSvg = $(this).find('svg');
				if(divSvg) {
					divSvg.width($(this).width() + 10);
					divSvg.height($(this).height() + 10);
				}
			});

			var hzCanvas = this.container;
			if (left !== undefined) hzX = left;
			else if(hzX === undefined)  hzX = (hzCanvas.width() - $svg_map_base.width()) / 2;
			else {
				var mapNewW = $svg_map_base.outerWidth() / 2;
				hzX +=  Math.round(mapOldW - mapNewW);
			}

			if (top !== undefined) hzY = top;
			else if(hzY === undefined) hzY = (hzCanvas.height() - $svg_map_base.height()) / 2;
			else {
				var mapNewH = $svg_map_base.outerHeight() / 2;
				hzY +=  Math.round(mapOldH - mapNewH);
			}

			$svg_map_base.css({
				left: hzX + 'px',
				top: hzY + 'px'
			});

			var mapLayer = $('#svg_image');
			if (mapLayer.css('display') == 'none') {
				mapLayer.toggle();
			}

			// 地图标识;
			showRoomName();

			// 移动 人员 marker
			for(var i = 0; i < hz_user_xy.length; i++) {
				this.hzPeopleSetPosition(hz_user_xy[i][1] * real_loc_to_pix * zoom,
					hz_user_xy[i][2] * real_loc_to_pix * zoom, hz_user_xy[i][0]);
			}

			// 地图缩放后的回调函数
			for(var j = 0; j < this.zoomCallBack.length; j++) {
				this.zoomCallBack[j]();
			}
		},

		// 移动标签位置到指定屏幕坐标 (x, y)，people 为标签id。移动标签，有动画。
		hzPeopleGoto: function (x, y, people) {
			people = people || '1918E00103AA'; // 设置默认参数
			var p = $('#'+people);

			// 24, 45是定位图标的 针尖 位置。显示图片时，是以图片左上角为参考坐标。故需要对坐标进行偏移。

			if (p.css("display") == 'none') {
				p.css({left: x-24, top: y-45});
				p.toggle();
			} else {
				p.stop(true, true).animate({
					left: (x - 24),
					top: (y - 45)
				});
			}

			if (people == '1918E00103AA') {
				var pName = $('#'+people+'-t');
				pName.stop(true, true).animate({
					left: (x - pName.width()/2),
					top: (y - 64)
				});
			}

			this.setPeopleCoord(x, y, people);
		},

		// 移动标签位置到指定坐标 (x, y) 为屏幕坐标，people 为标签id。 无动画移动标签。
		hzPeopleSetPosition: function (x, y, people) {
			people = people || '1918E00103AA'; // 设置默认参数
			var p = $('#'+people);
			p.css({left: x-24, top: y-45});
			if (p.css("display") == 'none') {
				p.toggle();
			}

			if (people == '1918E00103AA') {
				var pName = $('#'+people+'-t');
				pName.css({
					left: (x - pName.width()/2),
					top: (y - 64)
				});
			}

			this.setPeopleCoord(x, y, people);
		},

		// 保存用户的当前位置坐标, 地图坐标，单位mm
		setPeopleCoord: function (userId, x, y) {
			var i;
			for (i = 0; i < hz_user_xy.length; i++) {
				if (hz_user_xy[i][0] === userId) {
					hz_user_xy[i][1] = x;
					hz_user_xy[i][2] = y;
					break;
				}
			}

			if (i === hz_user_xy.length) {  // not find, add new user & coord.
				hz_user_xy[i] = [userId, x, y];
			}
		}

	};

	w.HzMap = HzMap;
})(window);
