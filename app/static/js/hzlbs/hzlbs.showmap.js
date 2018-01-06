

'use strict';

var hzX = 0, hzY = 0;   // 地图在容器中的位置（距离左上角的距离，left, top）
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
	var hzCanvas = $('#myCanvas');


	mapZoom(map_h * zoom, map_w * zoom);

	// 移动地图到 画布 的中央
	// console.log(hzCanvas.width(), $svg_map_base.width());
	hzX = (hzCanvas.width() - $svg_map_base.width()) / 2;
	hzY = (hzCanvas.height() - $svg_map_base.height()) / 2;
	$svg_map_base.css({
		left: hzX + 'px',
		top: hzY + 'px'
	});

	if(hz_user_id != 0) {       /// 设置选择用户（标签）图片
		$('#'+ HZ_USER_IDS[hz_user_id-1]).attr('src', '/static/img/peoplesel.png');
	}
	
	// 鼠标滚轮缩放svg图
	$svg_event.ready(function () {
		// 获取svg图对象
		var mapSign = $svg_map_base;
		
		//设置缩放速度   比例缩放
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
				mapZoom(resultHeight, resultWidth);
				
				$svg_map_base.css({
					left: hzX + 'px',
					top: hzY + 'px'
				});
				
				people_move_zoom();
				
				for(var j = 0; j < zoomCallBack.length; j++) {
					zoomCallBack[j]();
				}
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
			
			mapMouseLeft = event.pageX - mapOffset.left - mapMouseLeft;
			mapMouseLeft = coordScreenToMap(mapMouseLeft);
			mapMouseTop = event.pageY - mapOffset.top - mapMouseTop;
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


function zoomDo(zoom) {
	var $svg_map_base = $('#svg_map_base');

	var mapCenterX = hzX + $svg_map_base.outerWidth() / 2;
	var mapCenterY = hzY + $svg_map_base.outerHeight() / 2;
	
	mapZoom(zoom * map_h, zoom * map_w);
	
	hzX = Math.round(mapCenterX - $svg_map_base.outerWidth() / 2);
	hzY = Math.round(mapCenterY - $svg_map_base.outerHeight() / 2);
	$svg_map_base.css({
		left: hzX + 'px',
		top: hzY + 'px'
	});
	
	people_move_zoom();
	for(var j = 0; j < zoomCallBack.length; j++) {
		zoomCallBack[j]();
	}
}

// 缩小
function hzZoomOut() {
	zoom = parseFloat(zoom) - 0.05;
	storage['hz_zoom'] = zoom;
	zoomDo(zoom);
}

// 放大
function hzZoomIn() {
	zoom = parseFloat(zoom) + 0.05;
	storage['hz_zoom'] = zoom;
	zoomDo(zoom);
}

// 坐标拾取回调函数, fn 参数 x, y 单位 mm
function getCoordCallback(fn) {
	_mouseMoveCallback = fn;
}
