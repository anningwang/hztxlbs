/**
 * 和仲通讯 版权所有 2016-2018
 * 版本号：v0.3
 * SVG地图 Toolkit，实现地图显示、操作等函数
 */

'use strict';

var hzX = undefined, hzY = undefined;   // 地图在容器中的位置（距离左上角的距离，left, top）
var real_loc_to_pix = 0.0891;  // 物理坐标转像素的比例，比例转换计算公式: px = mm * real_loc_to_pix * zoom
var zoom = 0.486;       // 地图缩放级别
var margin = 0;         //外边距
var map_w = 3477;       // px
var map_h = 1769;       // 地图图片高度
var hz_is_navigating = false;           // 是否曾经设置过导航，或正在导航中
var HZ_DESTINATION_MEETING_ROOM = 27;    // 办公室编号
var hz_destination = HZ_DESTINATION_MEETING_ROOM;     // 导航的目的地，默认 第一个 目的地
var hz_user_id = 0;   // 为HZ_USER_IDS 的索引-1， 0 表示 未选择用户
var HZ_USER_IDS = ['1918E00103AA', '1918E00103A9'];
var hz_user_xy = [];   // 用户数据  每项为一个用户，[['1918E00103AA',x,y], ...]
var storage = window.localStorage;

if(storage){
	//storage.clear();
	var _userId = storage['hz_user_id'];
	if(typeof _userId !== 'undefined') {
		hz_user_id = _userId;
	}
	var hz_zoom = storage['hz_zoom'];
	if(typeof hz_zoom !== 'undefined') {    // 存在值
		zoom = hz_zoom;
	}
	
	var _dest = parseInt(storage['hz_destination']);
	hz_destination = isNaN(_dest) ? HZ_DESTINATION_MEETING_ROOM : _dest;
	
	//console.log(storage['hz_is_navigating'] + "  " + Boolean(storage['hz_is_navigating']));
	hz_is_navigating = Boolean(storage['hz_is_navigating']);
}else{
	//alert("浏览暂不支持localStorage");
}

var _mouseMoveCallback = undefined;     // 函数指针，鼠标移动回调函数指针

var	zoomCallBack = [];      // func Array 缩放需要执行的临时函数

$(function(){
	
	var $svg_map_base = $('#svg_map_base');
	var $svg_event = $('#svg_event');
	var $document = $(document);
	
	mapZoom(map_h * zoom, map_w * zoom);
	
	if(hz_user_id != 0) {       /// 设置选择用户（标签）图片
		$('#'+ HZ_USER_IDS[hz_user_id-1]).attr('src', '/static/img/peoplesel.png');
	}
	
	// 鼠标滚轮缩放svg图
	$svg_event.ready(function () {
		// 获取svg图对象
		var mapSign = $svg_map_base;
		
		// 设置缩放速度   比例缩放
		var zoomSpeed = 0.05;
		
		// using the event helper
		$svg_event.on('mousewheel', addMousewheelEvent);
		
		function addMousewheelEvent(event, delta) {	// , deltaX, deltaY
			//svg图的最小 最大  X和Y
			var mapMinX, mapMaxX, mapMinY, mapMaxY;
			var mapOffset = mapSign.offset();
			var mapOuterWidth = mapSign.outerWidth();
			var mapOuterHeight = mapSign.outerHeight();
			
			mapMinX = mapOffset.left;
			mapMaxX = mapOffset.left + mapOuterWidth;
			mapMinY = mapOffset.top;
			mapMaxY = mapOffset.top + mapOuterHeight;
			
			if(event.pageX > mapMinX && event.pageX < mapMaxX && event.pageY > mapMinY && event.pageY < mapMaxY) {
				// 取消默认事件
				event.preventDefault();
				
				// 计算速度
				var mapHeight, mapWidth, mapTopBorder, mapLeftBorder, mapTop, mapLeft, speedTop, speedLeft;
				mapHeight = mapSign.height();
				mapWidth = mapSign.width();
				
				mapTopBorder = parseInt(mapSign.css('border-top-width'));
				mapLeftBorder = parseInt(mapSign.css('border-left-width'));
				
				mapTop = parseInt(mapSign.css('top'));
				mapLeft = parseInt(mapSign.css('left'));
				
				
				// 计算缩放速度  单独的top  或  left
				
				if(delta == 1) {
					speedTop = parseInt(zoomSpeed * mapHeight);
					console.log('speedTop', speedTop);
					speedLeft = parseInt(zoomSpeed * mapWidth);
				} else {
					speedTop = -parseInt(zoomSpeed * mapHeight);
					speedLeft = -parseInt(zoomSpeed * mapWidth);
				}
				
				
				// 更改后的高
				var resultHeight = mapHeight + (speedTop * 2);
				var resultWidth = mapWidth + (speedLeft * 2);
				
				
				// 鼠标在图内距离
				var currentMouseTop = event.pageY - mapMinY - mapTopBorder;
				var currentMouseLeft = event.pageX - mapMinX - mapLeftBorder;
				// 缩放后在图内的距离
				var mouseTop = Math.round(currentMouseTop - (currentMouseTop / mapHeight * resultHeight));
				var mouseLeft = Math.round(currentMouseLeft - (currentMouseLeft / mapWidth * resultWidth));
				
				// 计算svg偏离位置
				hzY = mapTop + mouseTop;
				hzX = mapLeft + mouseLeft;
				
				// 保存缩放比例
				zoom = resultWidth / map_w;
				storage['hz_zoom'] = zoom;
				
				console.log('margin', margin, 'resultHeight', resultHeight, 'resultWidth', resultWidth);
				mapZoom(resultHeight, resultWidth, hzX, hzY);   // hzX, hzY 也可以不传递，由mapZoom函数自动计算
			}
		}
	});
	
	
	// 地图移动变量
	var mapMoveMousedownX, mapMoveMousedownY;
	var currentX, currentY;
	
	function addMapMoveEvent() {
		$svg_event.on('mousedown', mapMoveMousedownFn);
		$svg_event.on('mousemove', mapMouseMove);
		$svg_event.on('mouseout', mapMouseOut);
		
	}
	// 事件函数
	function mapMoveMousedownFn(e) {
		mapMoveMousedownX = e.pageX;
		mapMoveMousedownY = e.pageY;
		
		currentX = parseInt(hzX);
		currentY = parseInt(hzY);
		
		$svg_event.off('mousemove', mapMouseMove);
		$svg_event.off('mouseout', mapMouseOut);
		
		$document.on('mousemove', mapMoveMousemoveFn);
		$document.on('mouseup', mapMoveMouseupFn);
		$svg_event.css('cursor', 'move');
		return false;
	}
	
	function mapMoveMousemoveFn(e) {
		currentX = e.pageX - mapMoveMousedownX + parseInt(hzX);
		currentY = e.pageY - mapMoveMousedownY + parseInt(hzY);
		
		$svg_map_base.css({
			left: currentX + 'px',
			top: currentY + 'px'
		});
	}
	
	function mapMoveMouseupFn() {
		hzX = currentX;
		hzY = currentY;
		
		$svg_event.on('mousemove', mapMouseMove);
		$svg_event.on('mouseout', mapMouseOut);
		
		$document.off('mousemove', mapMoveMousemoveFn);
		$document.off('mouseup', mapMoveMouseupFn);
		$svg_event.css('cursor', 'default');
	}
	addMapMoveEvent();
	
	
	// 鼠标移动之 坐标拾取 功能。
	function mapMouseMove(e) {
		var mapBase = $svg_map_base;
		
		//svg图的最小 最大  X和Y
		var mapMinX,mapMaxX,mapMinY,mapMaxY;
		var mapOffset = mapBase.offset();
		var mapOuterWidth = mapBase.outerWidth();
		var mapOuterHeight = mapBase.outerHeight();
		
		mapMinX = mapOffset.left;
		mapMaxX = mapOffset.left + mapOuterWidth;
		mapMinY = mapOffset.top;
		mapMaxY = mapOffset.top + mapOuterHeight;
		
		if(e.pageX > mapMinX && e.pageX < mapMaxX && e.pageY > mapMinY && e.pageY <  mapMaxY){
			// 计算x y 数值
			var mapMouseLeft = parseInt(mapBase.css('border-left-width'));
			if(isNaN(mapMouseLeft)) mapMouseLeft = 0;
			var mapMouseTop = parseInt(mapBase.css('border-top-width'));
			if(isNaN(mapMouseTop)) mapMouseTop = 0;
			
			mapMouseLeft = e.pageX - mapOffset.left - mapMouseLeft;
			mapMouseLeft = coordScreenToMap(mapMouseLeft);
			mapMouseTop = e.pageY - mapOffset.top - mapMouseTop;
			mapMouseTop = coordScreenToMap(mapMouseTop);
			
			if (_mouseMoveCallback)  _mouseMoveCallback(mapMouseLeft, mapMouseTop);
		}else{
			if (_mouseMoveCallback)  _mouseMoveCallback('', '');
		}
	}
	
	function mapMouseOut(){
		if (_mouseMoveCallback)  _mouseMoveCallback('', '');
	}
	
	
});


// 缩放要调用的函数
function people_move_zoom() {
	for(var i = 0; i < hz_user_xy.length; i++) {
		hzPeopleSetPosition(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
			hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
	}
}


// 缩小
function hzZoomOut() {
	zoom = parseFloat(zoom) - 0.05;
	storage['hz_zoom'] = zoom;
	mapZoom(zoom * map_h, zoom * map_w);
}

// 放大
function hzZoomIn() {
	zoom = parseFloat(zoom) + 0.05;
	storage['hz_zoom'] = zoom;
	mapZoom(zoom * map_h, zoom * map_w);
}

// 坐标拾取回调函数, fn 参数 x, y 单位 mm
function getCoordCallback(fn) {
	_mouseMoveCallback = fn;
}



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
	var roomLayer = $('#svg_sign');
	roomLayer.svg();
	var svgRoom = roomLayer.svg('get');
	
	svg = svg || svgRoom;
	if(!svg) {
		console.log('showRoomName svg param is null, svg=', svg );
		return false;
	}
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

// 缩放地图，并设置地图的位置（left, top）
function mapZoom(height, width, left, top) {
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
	
	var hzCanvas = $('#myCanvas');
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
	people_move_zoom();
	
	// 地图缩放后的回调函数
	for(var j = 0; j < zoomCallBack.length; j++) {
		zoomCallBack[j]();
	}
	
}


// 移动标签位置到指定坐标 (x, y) 为屏幕坐标，people 为标签id。移动标签，有动画。
function hzPeopleGoto(x, y, people) {
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
}

// 移动标签位置到指定坐标 (x, y) 为屏幕坐标，people 为标签id。 无动画移动标签。
function hzPeopleSetPosition(x, y, people) {
	people = people || '1918E00103AA'; // 设置默认参数
	var p = $('#'+people);
	p.css({left: x-24, top: y-45});
	if (p.css("display") == 'none') {
		p.toggle();
	}
}

// 清除导航路径
function hzClearNavPath() {
	var pathLayer = $('#svg_path');
	var svg = pathLayer.svg('get');
	if (svg) svg.clear();
}


// 保存用户的当前位置坐标, 地图坐标，单位mm
function setPeopleCoord(userId, x, y) {
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
