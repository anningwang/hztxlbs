/**
 * hztx map：v0.4
 *
 * 和仲通讯 版权所有 2016-2018
 * Created by WXG on 2018/1/11.
 *
 * Requires: jQuery 1.2.2+
 */



//var hz_is_navigating = false;           // 是否曾经设置过导航，或正在导航中
//var HZ_DESTINATION_MEETING_ROOM = 27;    // 办公室编号
//var hz_destination = HZ_DESTINATION_MEETING_ROOM;     // 导航的目的地，默认 第一个 目的地
//var hz_user_id = 0;   // 为HZ_USER_IDS 的索引-1， 0 表示 未选择用户
//var HZ_USER_IDS = ['1918E00103AA', '1918E00103A9'];
var storage = window.localStorage;

(function(w) {

	// 房间名称所在坐标
	var _roomNameCoord = [
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

	// 地图移动变量
	var _oldX, _oldY;
	var _curX, _curY;

	var _picOffsetLeft = 26;                // 人物marker 图片针尖的偏移量：左偏移
	var _picOffsetTop = 45;                 // 人物marker 图片针尖的偏移量：上偏移
	var _textOffsetTop = 64;                // 文字marker上部偏移量。显示在人物marker的上方

	//-------------------------------------------------------------------------
	// begin of HzPeople
	//-------------------------------------------------------------------------
	function HzPeople(map, options) {
		this.id = options.id;
		this.text = options.text;
		this.x = options.x;
		this.y = options.y;
		this.map = map;
		this.img = options.img || '/static/img/people.png';

		map.userLayer.append('<img src="'+ this.img +'" style="position:absolute;display: none" id='+ options.id + ' />');
		map.userLayer.append('<div id="' + options.id + '-t" class="hz-div-people-txt" style="position:absolute;display: none">'+ options.text + '</div>');

		this.imgContainer = $('#'+options.id);
		this.textContainer = $('#'+options.id + '-t');

		this.renderer();
	}

	HzPeople.prototype = {
		constructor: HzPeople,  // 构造函数

		getId: function () {
			return this.id;
		},

		setText: function (text) {
			this.text = text;
			this.textContainer.text(text);
		},

		setPosition: function (x, y) {  // x,y 为 地图坐标
			this.x = x;
			this.y = y;

			this.renderer();
		},

		renderer: function () {
			var coord = {
				x: 	this.map.coordMapToScreen(this.x),
				y: 	this.map.coordMapToScreen(this.y)
			};

			var p = this.imgContainer;
			p.css({left: coord.x - _picOffsetLeft, top: coord.y - _picOffsetTop});
			if (p.css("display") == 'none') {
				p.toggle();
			}

			var pName = this.textContainer;
			pName.css({left: coord.x - pName.width()/2, top: coord.y - _textOffsetTop});
			if (pName.css("display") == 'none') {
				pName.toggle();
			}
		},

		moveTo: function (x, y) { // x,y 为 地图坐标
			this.x = x;
			this.y = y;

			var coord = {
				x: 	this.map.coordMapToScreen(this.x),
				y: 	this.map.coordMapToScreen(this.y)
			};

			var p = this.imgContainer;
			p.stop(true, true).animate({left: coord.x - _picOffsetLeft, top: coord.y - _picOffsetTop});

			var pName = this.textContainer;
			pName.stop(true, true).animate({left: coord.x - pName.width()/2, top: coord.y - _textOffsetTop});
		},
		
		destroy: function () {
			this.imgContainer.remove();
			this.textContainer.remove();
		}
	};

	//-------------------------------------------------------------------------
	// end of HzPeople
	//-------------------------------------------------------------------------


	//-------------------------------------------------------------------------
	// begin of HzMap
	//-------------------------------------------------------------------------
	function HzMap(options) {
		this.container = options.container;     // JQuery 对象
		this.baseLayer = this.addLayer(this.container, 'svg_map_base');
		this.mapSvgLayer = this.addMapSvg(this.baseLayer, 'svg_image', '/static/img/floor3.svg');
		this.pathLayer = this.addLayer(this.baseLayer, 'svg_path');
		this.pathLayer.svg();

		this.erLayer = this.addLayer(this.baseLayer, 'svg-electronic-rail');
		this.erLayer.svg();

		this.psLayer = this.addLayer(this.baseLayer, 'svg-people-stat-zone');
		this.psLayer.svg();

		this.hisLocLayer = this.addLayer(this.baseLayer, 'svg_path_history');
		this.hisLocLayer.svg();

		this.roomLayer = this.addLayer(this.baseLayer, 'svg_sign');
		this.userLayer = this.addLayer(this.baseLayer, 'svg_user_sign');
		this.eventLayer = this.addLayer(this.baseLayer, 'svg_event');   // mouse event: mouseup, mousedown, mousemove
		this.left = undefined;      // 地图在容器中的位置（距离左上角的距离，left, top）
		this.top = undefined;
		this.fator = 0.0891;        // 物理坐标转像素的比例
		this.zoom = 0.486;          // 地图缩放级别
		if (options.zoom !== undefined) this.zoom = options.zoom;
		this.mapW = 3477;           // 地图图片宽度 px
		this.mapH = 1769;           // 地图图片高度 px
		this.userList = {};         // 用户列表 { userId: HzPeople }
		this.erCtrlPanelId = 'hz-map-controller-panel-er';
		this.mouseMoveCallback = options.mouseMoveCallback;     // mouse 移动 之 坐标拾取 回调函数
		this.zoomCallback = [];     // func Array 缩放需要执行的临时函数

		this.zoom -= 0.1;           // 缩小了2个级别 0.05一个级别
		this.pathData = undefined;  // 导航路径信息（为地图缩放使用）
		this.hisLocData = undefined;    // 历史轨迹（为地图缩放使用）
		this.psZoneData = undefined;    // 盘点区域数据 （为地图缩放使用）
		this.erData = undefined;        // 电子围栏 （为地图缩放使用）
		
		// 显示地图
		this.mapZoom(this.mapH * this.zoom, this.mapW * this.zoom);
		
		// 增加鼠标滚轮缩放地图功能
		this.eventLayer.on('mousewheel', {_map: this}, this.doMouseWheel);

		// 地图平移及坐标拾取
		this.eventLayer.on('mousedown', {_map: this}, this.doMouseDown);
		this.eventLayer.on('mousemove', {_map: this}, this.doGetCoord);
		this.eventLayer.on('mouseout', {_map: this}, this.doMouseOut);

		// 创建放大缩小按钮
		this.createZoomCtrl();

		if(options.showERCtrlPanel)
			this.createElectronicRailCtrlPanel();

		if(options.coordView)
			this.createCoordView();

		// 标签实时位置
		var map = this;
		this.socket = io.connect(hz_connStr);
		this.socket.on('hz_position', function(msg) {
			console.log('hz_position', msg);
			for (var i=0; i<msg.length; i++){
				map.peopleMoveTo(msg[i]['x'], msg[i]['y'], msg[i]['userId']);
			}
		});
	}

	HzMap.prototype = {
		constructor:HzMap,  // 构造函数
		
		addLayer: function (parent, id) {
			parent.append('<div id=' + id + ' class="each_map_layer" />');
			return $('#'+id);
		},

		addMapSvg: function (parent, id, filepath) {
			parent.append('<img src="' + filepath +'" id=' + id + ' class="each_map_layer" />');
			return $('#'+id);
		},

		addPeople: function (options) {
			if (options && !this.userList.hasOwnProperty(options.id)) {     // 用户不存在
				this.userList[options.id] = new HzPeople(this, options);
				return true;
			}
			return false;
		},
		
		// 删除用户marker
		delPeople: function (userId) {
			var people = this.userList[userId];
			if(people){
				people.destroy();
				delete this.userList[userId]
			}
		},

		// 根据用户ID查询 HzPeople 对象
		getPeople: function (userId) {
			return this.userList[userId];
		},

		// 屏幕坐标转地图坐标(单位：mm)
		coordScreenToMap : function (px) {
			return Math.round(px / this.fator / this.zoom);
		},

		// 地图坐标(单位：mm)转屏幕坐标
		coordMapToScreen: function (mm) {
			return parseInt(mm * this.fator * this.zoom)
		},

		// 显示房间名称
		showRoomName: function () {
			this.roomLayer.svg();
			var svg = this.roomLayer.svg('get');
			svg.clear();

			for(var i = 0; i < _roomNameCoord.length; i++) {
				var str = 'translate(' + this.coordMapToScreen(_roomNameCoord[i].x) + ',' + this.coordMapToScreen(_roomNameCoord[i].y) + ')';
				var g1 = svg.group({
					transform: str
				});
				svg.text(g1, 0, 0, _roomNameCoord[i].name, {
					fontSize: _roomNameCoord[i].fontSize,
					fontFamily: 'Verdana',
					fill: 'blue'
				});
			}
		},

		mapZoom: function (height, width, left, top) {  // 缩放地图，并设置地图的位置（left, top）
			var base = this.baseLayer;
			var mapOldW = base.outerWidth() / 2;
			var mapOldH = base.outerHeight() / 2;

			// 缩放 div 中 svg 的 宽和高
			$('.each_map_layer').each(function () {
				$(this).css({height: height+'px', width: width+'px'});

				var divSvg = $(this).find('svg');
				if(divSvg) {
					divSvg.width($(this).width());
					divSvg.height($(this).height());
				}
			});

			var canvas = this.container;
			if (left !== undefined) this.left = left;
			else if(this.left === undefined)  this.left = (canvas.width() - base.width()) / 2;
			else {
				var mapNewW = base.outerWidth() / 2;
				this.left +=  Math.round(mapOldW - mapNewW);
			}

			if (top !== undefined) this.top = top;
			else if(this.top === undefined) this.top = (canvas.height() - base.height()) / 2;
			else {
				var mapNewH = base.outerHeight() / 2;
				this.top +=  Math.round(mapOldH - mapNewH);
			}

			base.css({
				left: this.left + 'px',
				top: this.top + 'px'
			});

			if (this.mapSvgLayer.css('display') == 'none') {
				this.mapSvgLayer.toggle();
			}

			// 地图标识;
			this.showRoomName();

			// 移动 人员 marker
			for(var userId in this.userList) {
				if (!this.userList.hasOwnProperty(userId))
					continue;
				var people = this.userList[userId];
				people.renderer();
			}

			// 地图缩放后的回调函数
			for(var j = 0; j < this.zoomCallback.length; j++) {
				this.zoomCallback[j].apply(this);
			}
		},

		// 移动标签位置到指定地图坐标 (x, y)，people 为标签id。移动标签，有动画。
		peopleMoveTo: function (x, y, people) {
			var hzPeople = this.getPeople(people);
			if (hzPeople){
				hzPeople.moveTo(x, y);
			} else {
				this.addPeople({id: people, x: x, y: y, text: people});
			}
		},

		doMouseWheel: function (event, delta) {
			var map = event.data._map;
			var base = map.baseLayer;

			// 设置缩放速度   比例缩放
			var zoomSpeed = 0.05;

			//svg图的最小 最大  X和Y
			var mapMinX, mapMaxX, mapMinY, mapMaxY;
			var mapOffset = base.offset();
			var mapOuterWidth = base.outerWidth();
			var mapOuterHeight = base.outerHeight();

			mapMinX = mapOffset.left;
			mapMaxX = mapOffset.left + mapOuterWidth;
			mapMinY = mapOffset.top;
			mapMaxY = mapOffset.top + mapOuterHeight;

			if(event.pageX > mapMinX && event.pageX < mapMaxX && event.pageY > mapMinY && event.pageY < mapMaxY) {
				// 取消默认事件
				event.preventDefault();

				// 计算速度
				var mapHeight, mapWidth, mapTopBorder, mapLeftBorder, mapTop, mapLeft, speedTop, speedLeft;
				mapHeight = base.height();
				mapWidth = base.width();

				mapTopBorder = parseInt(base.css('border-top-width'));
				mapLeftBorder = parseInt(base.css('border-left-width'));

				mapTop = parseInt(base.css('top'));
				mapLeft = parseInt(base.css('left'));


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
				map.top = mapTop + mouseTop;
				map.left = mapLeft + mouseLeft;

				// 保存缩放比例
				map.zoom = resultWidth / map.mapW;
				storage['hz_zoom'] = map.zoom;

				console.log('resultHeight', resultHeight, 'resultWidth', resultWidth);
				map.mapZoom(resultHeight, resultWidth, map.left, map.top);
			}
		},

		doMouseDown: function (e) {
			var map = e.data._map;

			_oldX = e.pageX;
			_oldY = e.pageY;

			_curX = parseInt(map.left);
			_curY = parseInt(map.top);

			map.eventLayer.off('mousemove', map.doGetCoord);
			map.eventLayer.off('mouseout', map.doMouseOut);

			$(document).on('mousemove', {_map: map}, map.doMapMove);
			$(document).on('mouseup', {_map: map}, map.stopMapMove);
			map.eventLayer.css('cursor', 'move');
			return false;
		},

		doMapMove: function (e) {
			var map = e.data._map;

			_curX = e.pageX - _oldX + parseInt(map.left);
			_curY = e.pageY - _oldY + parseInt(map.top);

			map.baseLayer.css({
				left: _curX + 'px',
				top: _curY + 'px'
			});
		},

		stopMapMove: function (e) {
			var map = e.data._map;

			map.left = _curX;
			map.top = _curY;

			map.eventLayer.on('mousemove', {_map: map}, map.doGetCoord);
			map.eventLayer.on('mouseout', {_map: map}, map.doMouseOut);

			$(document).off('mousemove', map.doMapMove);
			$(document).off('mouseup', map.stopMapMove);

			map.eventLayer.css('cursor', 'default');
		},

		// 鼠标移动之 坐标拾取 功能。
		doGetCoord: function (e) {
			var map = e.data._map;
			var mapBase = map.baseLayer;

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
				mapMouseLeft = map.coordScreenToMap(mapMouseLeft);
				mapMouseTop = e.pageY - mapOffset.top - mapMouseTop;
				mapMouseTop = map.coordScreenToMap(mapMouseTop);

				if (map.mouseMoveCallback)  map.mouseMoveCallback(mapMouseLeft, mapMouseTop);
				map.coordView.text('x=' + mapMouseLeft + ' y=' + mapMouseTop);
			}else{
				if (map.mouseMoveCallback)  map.mouseMoveCallback('', '');
				map.coordView.text('坐标拾取');
			}
		},

		doMouseOut: function (e) {
			var map = e.data._map;
			if (map.mouseMoveCallback)  map.mouseMoveCallback('', '');
			map.coordView.text('坐标拾取');
		},

		// 使用 ACE 框架。创建地图 缩放 按钮
		createZoomCtrl: function () {
			this.container.append(
				'<div  id="ctrl-panel" style="position:absolute; top:10px; left: 10px; z-index:1000;">' +
				'<div class="btn-group btn-group-vertical btn-group-sm" style="background:#FFF; border:1px solid #CCC;">' +
				'<div style="margin: 5px 5px;">' +
				'<button type="button" class="btn btn-inverse btn-sm" id="btn-hz-zoomIn"><i class="ace-icon fa fa-plus align-middle"></i></button>' +
				'</div>' +
				'<div style="margin: 5px 5px;">'+
				'<button type="button" class="btn btn-inverse btn-sm" id="btn-hz-zoomOut"><i class="ace-icon fa fa-minus align-middle"></i></button>'+
				'</div>'+
				'</div>'+
				'</div>'
			);
			
			$('#btn-hz-zoomIn').on('click', {_map: this}, this.zoomIn);
			$('#btn-hz-zoomOut').on('click',{_map: this}, this.zoomOut);
		},
		// 缩小
		zoomOut: function (e) {
			var map = e.data._map;
			map.zoom = parseFloat(map.zoom) - 0.05;
			storage['hz_zoom'] = map.zoom;
			map.mapZoom(map.zoom * map.mapH, map.zoom * map.mapW);
		},
		// 放大
		zoomIn: function (e) {
			var map = e.data._map;
			map.zoom = parseFloat(map.zoom) + 0.05;
			storage['hz_zoom'] = map.zoom;
			map.mapZoom(map.zoom * map.mapH, map.zoom * map.mapW);
		},

		// 创建坐标拾取显示区
		createCoordView: function () {
			this.container.append('<div id="hz-divCoordView">坐标拾取</div>');
			this.coordView =  $('#hz-divCoordView');
		},

		// 使用ACE框架，创建 电子围栏控制面板
		createElectronicRailCtrlPanel: function () {
			this.container.append(
				'<div id="' + this.erCtrlPanelId + '" style="position:absolute; top:10px; left:80px; z-index:1000; width:390px;">' +
				'<div class="btn-group btn-group-xs col-xs-12" id="er_hz_panel_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-danger disabled"><i class="ace-icon fa fa-tag align-top bigger-125"></i>电子围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErAdd">新增围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErChange">修改围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErDel">删除围栏</button>'+
				'<button type="button" class="btn btn-danger" id="btn_hz_queryEr">显示围栏</button>'+
				'</div>'+

				'<div class="map_panel_content col-xs-12" style="background:#FFF; border:1px solid #CCC;">'+
				'<div class="col-xs-12" style="display:none;" id="panelErAdd">'+
				'<div class="row" style="padding-right:10px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form-validate">'+
				'<div class="alert alert-info">设置围栏 <br/></div>'+

				'<div class="form-group">'+
				'<label for="er_name" class="col-sm-3 control-label no-padding-right">围栏名称:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="er_name" name="name" placeholder="请输入围栏名称" />'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<label for="er_floor_no" class="col-sm-3 control-label no-padding-right">楼层:</label>'+
				'<div class="col-sm-9">'+
				'<select class="form-control" id="er_floor_no" name="floorNo">'+
				'<option value="floor3">3楼</option>'+
				'</select>'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<label for="erAddDrawStyle" class="col-sm-3 control-label no-padding-right">绘制方式:</label>'+
				'<div class="col-sm-9">'+
				'<div class="col-xs-6">'+
				'<select class="form-control" id="erAddDrawStyle">'+
				'<option value="square">方形绘图</option>'+
				'<option value="polyline">折线绘图</option>'+
				'</select>'+
				'</div>'+
				'<div class="col-xs-6">'+
				'<button type="button" id="btnDrawAddEr" class="btn btn-xs btn-danger"> <span>开始绘制</span> <i class="ace-icon fa fa-arrow-right icon-on-right"></i> </button>'+
				'</div>'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<input type="submit" class="btn btn-success btn-xs" id="btnAddEr" value="提交" />'+
				'</div>'+
				'</div>'+

				'</form>'+
				'</div>'+
				'</div>'+

				'<div class="col-xs-12" style="display:none; " id="panelErChange">'+
				'<div class="row" style="padding-right:10px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form-validate2">'+
				'<div class="alert alert-info">修改围栏 <br />'+
				'</div>'+
				'<div class="form-group">'+
				'<label for="erOldName" class="col-sm-3 control-label no-padding-right">选择围栏:</label>'+
				'<div class="col-sm-9">'+
				'<select class="form-control" id="erOldName" name="name"></select>'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<label for="erNewName" class="col-sm-3 control-label no-padding-right">新名称:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="erNewName" name="name" placeholder="不填为不修改!" />'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<label for="erChangeDrawStyle" class="col-sm-3 control-label no-padding-right">绘制方式:</label>'+
				'<div class="col-sm-9">'+
				'<div class="col-xs-6">'+
				'<select class="form-control" id="erChangeDrawStyle">'+
				'<option value="square">方形绘图</option>'+
				'<option value="polyline">折线绘图</option>'+
				'</select>'+
				'</div>'+
				'<div class="col-xs-6">'+
				'<button type="button" id="btnDrawChangeEr" class="btn btn-xs btn-danger"> <span id="start_draw_span">开始绘制</span> <i class="ace-icon fa fa-arrow-right icon-on-right"></i> </button>'+
				'</div>'+
				'</div>'+
				'</div>'+

				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<input type="submit" class="btn btn-success btn-xs" id="btnChangeEr" value="提交" />'+
				'</div>'+
				'</div>'+
				'</form>'+
				'</div>'+
				'</div>'+

				'<div class="col-xs-12" style="display:none;" id="panelErDel">'+
				'<div class="row" style="padding-right:10px; height:200px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form-validate3">'+
				'<div class="alert alert-info">删除电子围栏 <br /></div>'+
				'<div class="form-group" id="er_item"></div>'+
				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<button type="button" class="btn btn-success btn-xs" id="btnErDel">删除</button>'+
				'</div>'+
				'</div>'+
				'</form>'+
				'</div>'+
				'</div>'+
				'</div>'+
				'</div>'
			);

			map = this;

			// svg地图 控制面板
			$("#er_hz_panel_button").find("button").on('click', function () {
				var btn = $(this);

				if (btn.attr('id') === 'btn_hz_queryEr'){
					if(btn.text() === '隐藏围栏') {
						map.hideElectronicRail();
						btn.text('显示围栏');
					} else {
						map.showElectronicRail();
						btn.text('隐藏围栏');
					}
					return;
				}

				if(btn.hasClass('active')) {
					er_button_slide_up(btn);
				}
				else {
					er_button_slide_down(btn)
				}
			});

			function er_button_slide_down(btn) {
				btn.addClass('active');
				btn.siblings().removeClass('active');
				var panel = $(btn.attr('data-hz-target'));
				panel.siblings().slideUp('100', function () {
					panel.slideDown();
				})
			}

			function er_button_slide_up(btn) {
				btn.removeClass('active');
				var panel = $(btn.attr('data-hz-target'));
				panel.slideUp();
			}

		},

		// 删除 电子围栏控制面板
		removeElectronicRailCtrlPanel: function () {
			$('#'+this.erCtrlPanelId).remove();
		},

		
		// 开始导航
		startNavigation: function (options) {
			this.socket.emit('hz_navigating',
				{'location': options.location, 'userId': options.userId });

			var map = this;
			// 导航路径
			this.socket.on('hz_path', function (msg) {
				console.log('hz_path', msg);
				map.pathData = msg;
				
				map.drawNavPath();
			});

			this.addZoomCallback(this.drawNavPath);
		},

		// 画导航路径
		drawNavPath: function () {
			if (!this.pathData) return;
			
			var msg = this.pathData;
			var pt_path = [];
			pt_path[0] = [this.coordMapToScreen(msg.x), this.coordMapToScreen(msg.y)];
			var people = this.getPeople(msg.userId);
			if(people){ people.renderer(); }
			
			// 44px 为 地图上的路线宽度
			for(var m = 0; m< msg.path.length; m++){
				pt_path[m+1] = [parseInt((msg.path[m].x+22-2) * this.zoom), parseInt((msg.path[m].y+22-2) * this.zoom)];
			}

			var peo = this.getPeople('destination');
			if (peo) {
				peo.setPosition(this.coordScreenToMap(pt_path[pt_path.length-1][0]),
					this.coordScreenToMap(pt_path[pt_path.length-1][1]));
			} else {
				this.addPeople({
					id: 'destination',
					x: this.coordScreenToMap(pt_path[pt_path.length-1][0]),
					y: this.coordScreenToMap(pt_path[pt_path.length-1][1]),
					text: '', img: '/static/img/dest.png'
				});
			}

			var svg = this.pathLayer.svg('get');
			svg.clear();
			var penColor = '#33cc61';
			svg.polyline(pt_path, {fill: 'none', stroke: penColor, strokeWidth: 7});

			// ----------------------------------------------------------------
			// 画箭头
			var defs = svg.defs('myDefs');
			var marker = svg.marker(defs, 'arrow', 6, 6, 12, 12, {markerUnits: 'userSpaceOnUse'});
			var arrow = svg.createPath();
			svg.path(marker, arrow.move(2,2).line(10,6).line(2,10).line(6,6).line(2,2),
				{fill: 'white'}
			);

			var retPath = this.convertSvgPath(pt_path, svg);
			for (var i = 0; i < retPath.length; i++) {
				// markerStart:"url(#arrow)"
				svg.path(retPath[i], {fill: 'none', stroke: penColor, strokeWidth: 1, markerMid:"url(#arrow)",  markerEnd:"url(#arrow)"});
			}

			// ----------------------------------------------------------------
		},

		// 转换svg path，每50像素设置一个marker
		// path : array of [x, y] coordinate, [[x,y], ...]
		convertSvgPath: function (path, svg) {
			var retPath = [];
			var pt = [];
			if (path.length > 0) {
				pt = path[0];
			}
			var dist = 50, restDist = 0, ret;
			for(var i=1; i< path.length; i++) {
				if(path[i][0] == pt[0]) {   // 沿 Y 轴的直线
					if (i+1 < path.length && path[i+1][0] == pt[0])
						continue;
				} else if(path[i][1] == pt[1]) {    // 沿 X 轴的直线
					if (i+1 < path.length && path[i+1][1] == pt[1])
						continue;
				} else {    // 斜线
					// 过滤 斜率相同点的代码待实现。
				}

				ret = this.genSVGPath({x: pt[0], y: pt[1]}, {x: path[i][0], y: path[i][1]}, dist, restDist, svg);
				if(ret.svgPath) { retPath.push(ret.svgPath); }
				restDist = ret.restDist;

				pt = path[i];
			}
			return retPath;
		},

		genSVGPath: function (p1, p2, d, restDist, svg) {
			var k = this.skew(p1.x, p1.y, p2.x, p2.y);
			var dist = this.distance(p1.x, p1.y, p2.x, p2.y);
			var num = (dist + restDist) / d;
			var data = { svgPath: undefined, restDist: 0};
			var j, svgPath, point, pt = [p1.x, p1.y], direction;
			if (p2.x !== p1.x)  direction = p2.x-p1.x > 0;
			else direction = p2.y-p1.y > 0;
			for(j = 1; j < num; j++) {
				if (j == 1) {
					svgPath = svg.createPath();
					svgPath.move(p1.x, p1.y);
					point = this.getPoint(pt[0], pt[1], k, d - restDist, direction);
				} else {
					point = this.getPoint(pt[0], pt[1], k, d, direction);
				}
				pt = [point.x, point.y];
				svgPath.line(pt[0], pt[1]);
			}
			if (j > 1)
				data.svgPath = svgPath;
			data.restDist = (dist + restDist) - (j - 1) * d;
			return data;
		},

		// 停止导航
		stopNavigation: function () {
			this.socket.emit('hz_stop_navigating');
			var svg = this.pathLayer.svg('get');
			if (svg) svg.clear();
			this.pathData = undefined;
			this.delZoomCallback(this.drawNavPath);
			this.delPeople('destination');
		},

		// 增加缩放地图的回调函数
		addZoomCallback: function (func) {
			for(var i=0; i< this.zoomCallback.length; i++){
				if (this.zoomCallback[i] === func){
					return;
				}
			}
			this.zoomCallback.push(func);
		},

		// 删除缩放地图的回调函数
		delZoomCallback: function (func) {
			for(var i=0; i< this.zoomCallback.length; i++){
				if (this.zoomCallback[i] === func){
					this.zoomCallback.splice(i, 1);
					break;
				}
			}
		},

		// 画历史轨迹
		drawHistoryLocation: function (data) {
			if (data)
				this.hisLocData = data;
			else
				data = this.hisLocData;
			
			var svg = this.hisLocLayer.svg('get');
			svg.clear();
			
			var points = [];
			var pt = [];
			for(var key in data) {
				if (!data.hasOwnProperty(key)) continue;
				for (var m=0; m< data[key].length; m++) {
					pt = [];
					pt.push(this.coordMapToScreen(data[key][m].x));
					pt.push(this.coordMapToScreen(data[key][m].y));
					points.push(pt)
				}
				svg.polyline(points,{fill: 'none', stroke: 'blue', strokeWidth: 1});
				svg.text(points[0][0],points[0][1],'起',{fontSize: 16, fontFamily: 'Verdana',fill:'red'});
				svg.text(points[data[key].length-1][0],points[data[key].length-1][1],'终',{fontSize: 16, fontFamily: 'Verdana',fill:'red'});
			}
			
			this.addZoomCallback(this.drawHistoryLocation);
		},
		// 清除历史轨迹
		clearHistoryLocation: function () {
			this.hisLocData = undefined;
			this.delZoomCallback(this.drawHistoryLocation);
			this.hisLocLayer.svg('get').clear();
		},
		
		// 显示盘点区域
		showPeopleStatZone: function () {
			map = this;
			getPeopleStatZoneCfg({
				callback: function (data) {
					map.psZoneData = data.data.rows;
					map.drawPeopleStatZone();
					map.addZoomCallback(map.drawPeopleStatZone);
				}
			});
		},
		// 隐藏盘点区域
		hidePeopleStatZone: function () {
			this.psZoneData = undefined;
			this.psLayer.svg('get').clear();
			this.delZoomCallback(this.drawPeopleStatZone);
			
		},
		// 画盘点区域
		drawPeopleStatZone:function () {
			var svg = this.psLayer.svg('get');
			svg.clear();

			data = this.psZoneData;
			for(var k = 0; k < data.length; k++) {
				var pts = data[k].points;
				var pointsScreen = [];
				var ptArr;
				
				for(var i = 0; i < pts.length; i++) {
					ptArr = [];
					ptArr.push(this.coordMapToScreen(pts[i].x));
					ptArr.push(this.coordMapToScreen(pts[i].y));
					pointsScreen.push(ptArr);
				}
				
				// 增加第一个起点，使区域闭合
				ptArr = [];
				ptArr.push(this.coordMapToScreen(pts[0].x));
				ptArr.push(this.coordMapToScreen(pts[0].y));
				pointsScreen.push(ptArr);
				
				svg.polyline(pointsScreen, {
					fill: 'DeepSkyBlue',
					opacity: 0.6,
					stroke: 'blue',
					strokeWidth: 5
				});
				
				svg.text(this.coordMapToScreen(pts[0].x) + 10, this.coordMapToScreen(pts[0].y) + 20, data[k].name, {
					fontSize: 14,
					fontFamily: 'Verdana',
					fill: 'RoyalBlue'
				});
			}
		},

		// 显示电子围栏
		showElectronicRail: function () {
			map = this;
			getElectronicRailCfg({
				callback: function (data) {
					map.erData = data.data;
					map.drawElectronicRail();
					map.addZoomCallback(map.drawElectronicRail);
				}
			});
		},
		// 隐藏电子围栏
		hideElectronicRail: function () {
			this.erData = undefined;
			this.erLayer.svg('get').clear();
			this.delZoomCallback(this.drawElectronicRail);
		},

		// 画电子围栏
		drawElectronicRail: function() {
			var svg = this.erLayer.svg('get');
			svg.clear();

			data = this.erData;
			for(var k = 0; k < data.length; k++) {
				var pts = data[k].points;
				var pointsScreen = [];
				var ptArr;

				for (var i = 0; i < pts.length; i++) {
					ptArr = [];
					ptArr.push(this.coordMapToScreen(pts[i].x));
					ptArr.push(this.coordMapToScreen(pts[i].y));
					pointsScreen.push(ptArr);
				}

				// 增加第一个起点，使区域闭合
				ptArr = [];
				ptArr.push(this.coordMapToScreen(pts[0].x));
				ptArr.push(this.coordMapToScreen(pts[0].y));
				pointsScreen.push(ptArr);

				svg.polyline(pointsScreen, {
					fill: 'pink',
					stroke: 'red',
					opacity: 0.6,
					strokeWidth: 5
				});

				svg.text(this.coordMapToScreen(pts[0].x) + 10, this.coordMapToScreen(pts[0].y) + 20, data[k].name, {
					fontSize: 14,
					fontFamily: 'Verdana',
					fill: 'red'
				});
			}
		},

		// ------------------------------------------------------------------------
		// 工具函数
		// ------------------------------------------------------------------------

		distance: function (x1, y1, x2, y2) {
			return Math.sqrt(Math.pow((x2-x1),2) + Math.pow((y2-y1),2));
		},
		// 直线的斜率
		skew: function (x1, y1, x2, y2) {
			return (y2-y1)/(x2-x1);
		},
		// 获取斜率为 k 的直线上距离点（x1,y1）长度为 d 的点坐标。
		// 坐标原点在左上，向右为X轴正向，向下为Y轴正向。
		// xAxisRight: true(默认), 斜线取点方向为X轴的正方向。 false, 取点方向为 X 轴 负方向。
		//   当为平行于Y的直线时，true，为 Y 轴正向。false, 取点方向为 Y 轴 负方向。
		getPoint: function (x1, y1, k, d, xAxisRight) {
			d = d || 50;
			xAxisRight = xAxisRight !== false;
			if (k === Infinity || k === -Infinity) {    // 直线为平行于Y轴的情况，其斜率为 无穷大
				if (xAxisRight)
					return {'x': x1, 'y': y1 + d };
				else
					return {'x': x1 , 'y': y1 - d };
			} else {
				var f = d / Math.sqrt(Math.pow(k,2) + 1);
				if (xAxisRight)
					return {'x': x1 + f , 'y': y1 + f * k };
				else
					return {'x': x1 - f , 'y': y1 - f * k };
			}
		}
	};
	//-------------------------------------------------------------------------
	// end of HzMap
	//-------------------------------------------------------------------------

	w.HzMap = HzMap;
})(window);