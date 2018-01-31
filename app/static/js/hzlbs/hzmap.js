/**
 * hztx map：v0.4
 *
 * 和仲通讯 版权所有 2016-2018
 * Created by WXG on 2017/9/11.
 *
 * Requires: jQuery 1.2.2+
 *           jquery.validate.js
 */

document.write('<script src="/static/ace/components/jquery-validation/dist/jquery.validate.js"></script>');

(function(w) {
	'use strict';

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

	var CTRL_PANEL_LEFT = 120;

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

		map.eventLayer.append('<img src="'+ this.img +'" style="position:absolute;display: none" id='+ options.id + ' />');
		map.eventLayer.append('<div id="' + options.id + '-t" class="hz-div-people-txt" style="position:absolute;display: none">'+ options.text + '</div>');

		this.imgContainer = $('#'+options.id);
		this.textContainer = $('#'+options.id + '-t');

		var people = this;

		this.imgContainer.mouseover(function () {
			$(this).css("cursor","pointer");
		}).mouseout(function () {
			$(this).css("cursor","default");
		}).click(function () {
			var oldSelect = map.getSelectPeople();
			if (oldSelect) { oldSelect.unselect(); }
			people.select();
		});

		this.textContainer.mouseover(function () {
			$(this).css("cursor","pointer");
		}).mouseout(function () {
			$(this).css("cursor","default");
		}).click(function () {
			var oldSelect = map.getSelectPeople();
			if (oldSelect) { oldSelect.unselect(); }
			people.select();
		});

		if(map.tools.selectUserId == this.id) { this.select();  }

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

		// 选中用户
		select: function () {
			this.imgContainer.attr('src', '/static/img/peoplesel.png');
			this.map.tools.setSelectUserId(this.getId());
		},

		unselect: function () {
			this.imgContainer.attr('src', '/static/img/people.png');
			this.map.tools.setSelectUserId('');
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
		options = options || {};
		if (!options.container) { return; }

		this.tools =  hzlbs.HzTools;
		this.left = undefined;      // 地图在容器中的位置（距离左上角的距离，left, top）
		this.top = undefined;
		this.fator = 0.0891;        // 物理坐标转像素的比例
		this.zoom = this.tools.zoom;      // 地图缩放级别
		if (options.zoom !== undefined) this.zoom = options.zoom;
		this.mapW = 3477;           // 地图图片宽度 px
		this.mapH = 1769;           // 地图图片高度 px
		
		this.pathData = undefined;      // 导航路径信息（为地图缩放使用）
		this.hisLocData = undefined;    // 历史轨迹（为地图缩放使用）
		this.psZoneData = undefined;    // 盘点区域数据 （为地图缩放使用）
		this.erData = undefined;        // 电子围栏 （为地图缩放使用）

		this.container = options.container;     // JQuery 对象
		this.baseLayer = this.addLayer(this.container, 'svg_map_base');
		this.mapSvgLayer = this.addMapSvg(this.baseLayer, 'svg_image', '/static/img/floor3.svg');
		this.pathLayer = this.addLayer(this.baseLayer, 'svg_path');
		this.pathLayer.svg();
		this.erLayer = this.addLayer(this.baseLayer, 'svg-electronic-rail');
		this.erLayer.svg();
		this.erDraftLayer = this.addLayer(this.baseLayer, 'svg-electronic-rail-draft');
		this.erDraftLayer.svg();
		this.psLayer = this.addLayer(this.baseLayer, 'svg-people-stat-zone');
		this.psLayer.svg();
		this.psDraftLayer = this.addLayer(this.baseLayer, 'svg-people-stat-zone-draft');
		this.psDraftLayer.svg();
		this.hisLocLayer = this.addLayer(this.baseLayer, 'svg_path_history');
		this.hisLocLayer.svg();
		this.roomLayer = this.addLayer(this.baseLayer, 'svg_sign');
		//this.userLayer = this.addLayer(this.baseLayer, 'svg_user_sign');
		//this.tempLineLayer = this.addLayer(this.baseLayer, 'svg_temporary_line');
		//this.tempLineLayer.svg();
		this.drawEventLayer = this.addDrawEventLayer();
		this.drawEventLayer.svg();
		this.eventLayer = this.addLayer(this.baseLayer, 'svg_event');   // mouse event: mouseup, mousedown, mousemove

		this.userList = {};         // 用户列表 { userId: HzPeople }
		this.erCtrlPanelId = 'hz_map_controller_panel_er';
		this.isErShowing = false;   // 电子围栏处于“显示”状态。
		if (options.showErZone) { this.showElectronicRail(); }
		this.psCtrlPanelId = 'hz_map_controller_panel_ps';
		this.isPsShowing = false;   // 盘点区域 处于“显示”状态。
		if (options.showPsZone) { this.showPeopleStatZone(); }
		this.navCtrlPanelId = 'hz_map_controller_panel_nav';
		this.hisLocCtrlPanelId = 'hz_map_controller_panel_hisLoc';
		this.zoomCtrlPanelId = 'hz_zoom_ctrl_panel';
		this.serviceCtrlPanelId = 'hz_service_ctrl_panel';
		this.mouseMoveCallback = options.mouseMoveCallback;     // mouse 移动 之 坐标拾取 回调函数
		this.zoomCallback = [];     // func Array 缩放需要执行的临时函数
		this.restoreTools = new hzlbs.Util.Init();     // 恢复工具类，恢复每次绘图的状态
		this.restoreService = new hzlbs.Util.Init();   // 业务控制面板按钮间初始化对象
		
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
		
		// 创建电子围栏控制面板
		if(options['showERCtrlPanel']) { this.createElectronicRailCtrlPanel(); }
		
		// 创建盘点区域控制面板
		if(options['showPSCtrlPanel']) { this.createPeopleStatCtrlPanel(); }

		// 创建历史轨迹控制面板
		if(options['showHisLocCtrlPanel']) { this.createHistoryLocationCtrlPanel();  }

		// 创建地图导航控制面板
		if(options['showNavCtrlPanel']) { this.createNavigationCtrlPanel(); }

		// 创建坐标拾取视图（显示框）
		if(options.coordView) { this.createCoordView(); }

		// 创建 业务（电子围栏、人员盘点等）控制面板
		if(options.showServicePanel) { this.createServicePanel(); }

		// 通知组件
		this.container.append('<div id="gritter-notice-wrapper" style="position:absolute; right:0; z-index:1001;"></div>');

		this.messager = this.addMessageBox(this.container, 'hz_messager');

		// 标签实时位置
		var map = this;
		this.socket = io.connect(hzlbs.CONST.HZ_CONN_STR);
		this.socket.on('hz_position', function(msg) {
			console.log('hz_position', msg);
			for (var i=0; i<msg.length; i++){
				map.peopleMoveTo(msg[i]['x'], msg[i]['y'], msg[i]['userId']);
			}
		});

		// 电子围栏信息
		this.socket.on('hz_electronic_tail', function (msg) {
			//console.log('电子围栏：', msg);
			for (var i=0; i< msg.length; i++){
				var state = (msg[i].status == 1) ? '进入': '离开';
				gritter_alert('电子围栏警报', '用户ID【' + msg[i].userId + '】 '+
					msg[i].datetime +' 【'+ state + '】了电子围栏【' + msg[i].name + '】');
			}
		});
		
		this.socket.on('connect', function() {
			map.socket.emit('hz_event', {data: "I'm connected!"});
			if (map.tools.getNavStatus()) {
				map.startNavigation({
					location: map.tools.getDestination(),
					userId: map.tools.getNavUserId()
				});
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
		addMessageBox: function (parent, id) {
			parent.append(
				'<div id="' + id + '" class="alert alert-warning hidden" style="margin-top: 100px;margin-left: 200px; margin-right: 200px" >'+
				'<a href="#" class="close" data-dismiss="alert">&times;</a>'+
				'<span><strong>警告！</strong></span>'+
				'</div>'
			);
			return $('#'+id);
		},
		// 添加 画图 事件 层
		addDrawEventLayer: function (options) {
			options = options || {};
			var parent = options.parent || this.baseLayer;
			var id = options.id || 'enclosureEvent';
			parent.append('<div id=' + id + ' class="each_map_layer" style="display:none;" />');
			var drawEventLayer = $('#'+id);
			var img = options.img || '/static/img/drawing.png';
			drawEventLayer.append('<img src="' + img +'" id="line_start" title="绘制起点" style="position:absolute; display:none;">');

			return drawEventLayer;
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
		getSelectPeople: function () {
			return this.userList[this.tools.selectUserId];
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

			if(this.zoom < 0.2) { return; }

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
				$(this).css({height: height, width: width});
				
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
				left: this.left,
				top: this.top
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
				var _zoom = resultWidth / map.mapW;

				if (_zoom > 0.05) {
					map.zoom = resultWidth / map.mapW;
					map.tools.setZoom(map.zoom);
					map.mapZoom(resultHeight, resultWidth, map.left, map.top);

					map.messager.addClass('hidden');
				} else {
					map.messager.removeClass('hidden');
					map.messager.html('<strong>警告！</strong>已经是最小级别!');
				}
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
				left: _curX,
				top: _curY
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
			if(document.getElementById(this.zoomCtrlPanelId)){ return; }  // 存在则退出函数
			this.container.append(
				'<div id="' + this.zoomCtrlPanelId+ '" style="position:absolute; top:10px; left: 10px; z-index:1000;">' +
				'<div class="btn-group btn-group-vertical btn-group-sm" style="background:#FFF; border:1px solid #CCC;">' +
				'<div style="margin: 5px 5px;">' +
				'<button type="button" class="btn btn-inverse btn-sm" id="btn_hz_zoomIn"><i class="ace-icon fa fa-plus align-middle"></i></button>' +
				'</div>' +
				'<div style="margin: 5px 5px;">'+
				'<button type="button" class="btn btn-inverse btn-sm" id="btn_hz_zoomOut"><i class="ace-icon fa fa-minus align-middle"></i></button>'+
				'</div>'+
				'</div>'+
				'</div>'
			);
			var map = this;
			$('#btn_hz_zoomIn').click(function () {
				map.zoomIn();
			});
			$('#btn_hz_zoomOut').click(function () {
				map.zoomOut();
			});
		},

		// --------------------------------------------------------------------
		// 业务工具面板 功能代码 begin
		// --------------------------------------------------------------------

		// 创建 业务工具面板
		createServicePanel: function () {
			if(document.getElementById(this.serviceCtrlPanelId)){ return; }  // 存在则退出函数
			this.container.append(
				'<div id="'+ this.serviceCtrlPanelId + '" style="position:absolute; top:120px; left: 10px; z-index:1000;">' +
				'<div class="btn-group btn-group-vertical btn-group-sm" style="background:#FFF; border:1px solid #CCC;">' +

				'<div style="margin: 5px 5px;">' +
				'<button type="button" class="btn btn-pink btn-sm hz_btn_class_service" id="hz_btn_showNavPanel"><i class="ace-icon fa fa-road align-middle"></i>导航</button>' +
				'</div>' +
				'<div class="hr hr-2"></div>'+

				'<div style="margin: 5px 5px;">' +
				'<button type="button" class="btn btn-info btn-sm hz_btn_class_service" id="hz_btn_showHisLocPanel"><i class="ace-icon fa fa-location-arrow align-middle bigger-125"></i>轨迹</button>' +
				'</div>' +
				'<div class="hr hr-2"></div>'+

				'<div style="margin: 5px 5px;">' +
				'<button type="button" class="btn btn-danger btn-sm hz_btn_class_service" id="hz_btn_showErPanel"><i class="ace-icon fa fa-square-o align-middle bigger-125"></i>围栏</button>' +
				'</div>' +
				'<div class="hr hr-2"></div>'+

				'<div style="margin: 5px 5px;">'+
				'<button type="button" class="btn btn-primary btn-sm hz_btn_class_service" id="hz_btn_showPsPanel"><i class="ace-icon fa fa-check-square-o align-middle bigger-115"></i>盘点</button>'+
				'</div>'+

				'</div>'+
				'</div>'
			);
			var map = this;
			var panel = $('#'+this.serviceCtrlPanelId);
			var btnShowNav = $('#hz_btn_showNavPanel');

			// 显示 导航控制面板 button
			btnShowNav.click(function () {
				serviceButtonClick($(this), map, map.createNavigationCtrlPanel, map.removeNavigationCtrlPanel);
			});

			$('#hz_btn_showHisLocPanel').click(function () {
				serviceButtonClick($(this), map, map.createHistoryLocationCtrlPanel, map.removeHistoryLocationCtrlPanel);
			});

			// 显示 电子围栏 button
			$('#hz_btn_showErPanel').click(function () {
				serviceButtonClick($(this), map, map.createElectronicRailCtrlPanel, map.removeElectronicRailCtrlPanel);
			});

			// 显示 盘点控制 button
			$('#hz_btn_showPsPanel').click(function () {
				serviceButtonClick($(this), map, map.createPeopleStatCtrlPanel, map.removePeopleStatCtrlPanel);
			});

			function serviceButtonClick(btn, map, mapFuncOpen, mapFuncClose) {
				var old_active = false;
				map.restoreService.run();
				if(btn.hasClass('active')) {    // 已经激活
					old_active = true;
				} else {    // 未激活
					mapFuncOpen.call(map);
					map.restoreService.add(map, mapFuncClose);
				}
				panel.find('.hz_btn_class_service').removeClass('active');
				if (old_active) {
					btn.removeClass('active');
				} else {
					btn.addClass('active');
				}
			}

			// 业务控制面板 和 导航、轨迹、围栏或者盘点 控制面板同时显示时，控制 页面面板按钮的状态。
			if (document.getElementById(this.navCtrlPanelId)) {
				btnShowNav.addClass('active');
				this.restoreService.add(this, this.removeNavigationCtrlPanel);
			}

		},
		// --------------------------------------------------------------------
		// 业务工具面板 功能代码 end
		// --------------------------------------------------------------------
		
		// 缩小
		zoomOut: function () {
			var _zoom = parseFloat(this.zoom) - 0.05;
			if (_zoom > 0.05) {
				this.zoom = parseFloat(this.zoom) - 0.05;
				this.tools.setZoom(this.zoom);
				this.mapZoom(this.zoom * this.mapH, this.zoom * this.mapW);
				this.messager.addClass('hidden');
			} else {
				this.messager.removeClass('hidden');
				this.messager.html('<strong>警告！</strong>已经是最小级别!');
			}
		},
		// 放大
		zoomIn: function () {
			this.zoom = parseFloat(this.zoom) + 0.05;
			this.tools.setZoom(this.zoom);
			this.mapZoom(this.zoom * this.mapH, this.zoom * this.mapW);
			this.messager.addClass('hidden');
		},

		// 创建坐标拾取显示区
		createCoordView: function () {
			this.container.append('<div id="hz-divCoordView">坐标拾取</div>');
			this.coordView =  $('#hz-divCoordView');
		},

		// --------------------------------------------------------------------
		// 历史轨迹控制面板 功能代码 begin
		// --------------------------------------------------------------------
		createHistoryLocationCtrlPanel: function () {
			if (document.getElementById(this.hisLocCtrlPanelId)) { return; }  // 存在则退出函数

			this.container.append(
			'<div id="' + this.hisLocCtrlPanelId + '" style="position:absolute; top:10px; left:'+CTRL_PANEL_LEFT+'px; z-index:1000; width:540px;">'+
				'<div class="btn-group btn-group-xs col-xs-12" id="hz_nav_panel_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-info disabled"><i class="ace-icon fa fa-location-arrow align-top bigger-125"></i>轨迹</button>'+
				'<input type="text"  id="hz_startTime" class="date-timepicker btn btn-info"  placeholder="起始时间" style="width:178px;"/>'+
				'<input type="text" id="hz_endTime" class="date-timepicker btn btn-info" placeholder="截止时间" style="width:178px;"/>'+
				'<button type="button" class="btn btn-info" id="hz_btnQueryHisLoc" >查询</button>'+
				'<button type="button" class="btn btn-info" id="hz_btnClearHisLoc">清除</button>'+
				'</div>'+
				'</div>'
			);

			$('.date-timepicker').datetimepicker({
				language: 'zh-CN',
				format: 'yyyy-mm-dd hh:ii:ss',
				autoclose: true
			});

			var oStartTime = $('#hz_startTime');
			var oEndTime = $('#hz_endTime');
			var curDate = new Date();
			var startDate = new Date(curDate.getTime() - 60 * 60 * 1000);
			
			oStartTime.val(hzlbs.Util.getDate(startDate));
			oEndTime.val(hzlbs.Util.getDate(curDate));

			var map = this;
			// 查询历史轨迹
			$('#hz_btnQueryHisLoc').click(function () {
				if(!map.getSelectPeople()) {
					hzInfo('请在地图上选择用户。');
					return;
				}
				var userId = map.getSelectPeople().getId();

				var startTime = oStartTime.val();
				if(startTime == ''){
					hzInfo('请选择查询起始时间');
					return;
				}

				var endTime = oEndTime.val();
				if(endTime == ''){
					hzInfo('请选择查询截止时间');
					return;
				}

				getHistoryLocation({
					userId: [userId],
					datetimeFrom: startTime,
					datetimeTo: endTime,
					callback:function (data) {
						if(data.total == 0)
							hzInfo('该时间段没有数据！');
						map.drawHistoryLocation(data.data);
					}
				});
			});

			// 清除 历史轨迹
			$('#hz_btnClearHisLoc').click(function () {
				map.clearHistoryLocation();
			});

		},

		// 删除 电子围栏控制面板
		removeHistoryLocationCtrlPanel: function () {
			$('#'+this.hisLocCtrlPanelId).remove();
		},

		// --------------------------------------------------------------------
		// 历史轨迹控制面板 功能代码 end
		// --------------------------------------------------------------------

		// --------------------------------------------------------------------
		// 导航控制面板 功能代码 begin
		// --------------------------------------------------------------------

		// 使用ACE框架，创建 导航控制面板
		createNavigationCtrlPanel: function () {
			if (document.getElementById(this.navCtrlPanelId)) { return; }  // 存在则退出函数

			this.container.append(
				'<div id="' + this.navCtrlPanelId + '" style="position:absolute; top:10px; left:'+CTRL_PANEL_LEFT+'px; z-index:1000; width:370px;">'+
				'<div class="btn-group btn-group-xs col-xs-12" id="hz_panel_nav_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-pink disabled"><i class="ace-icon fa fa-road align-top bigger-125"></i>导航</button>'+
				'<select id="hz_nav_dest" class="btn btn-pink" name="locations" style="font-family:Verdana,sans-serif;" title="目的地">'+
				'<option value="27">Room 1 北斗羲和</option>'+
				'<option value="29">Room 2</option>'+
				'<option value="30">Room 3</option>'+
				'<option value="31">Room 4 健身房</option>'+
				'<option value="32">Room 5</option>'+
				'<option value="33">Room 6</option>'+
				'<option value="34">Room 7 演示厅</option>'+
				'<option value="23">会议室</option>'+
				'<option value="28">总裁办公室</option>'+
				'<option value="24">副总办公室</option>'+
				'<option value="25">仓库1</option>'+
				'<option value="26">仓库2</option>'+
				'</select>'+
				'<button type="button" class="btn btn-pink" id="hz_btn_begin_nav" >开始导航</button>'+
				'<button type="button" class="btn btn-pink" id="hz_btn_stop_nav">结束导航</button>'+
				'</div>'+
				'</div>'
			);
			var map = this;

			$("#hz_nav_dest").val(parseInt(this.tools.getDestination()));

			// 开始导航 button
			$('#hz_btn_begin_nav').click(function () {
				var selectPeople = map.getSelectPeople();
				if(!map.tools.navUserId && !selectPeople) {
					hzInfo('请在地图上选择要导航的用户。');
					return;
				}
				map.startNavigation({
					location: $('#hz_nav_dest').val(),
					userId: selectPeople.getId() || map.tools.navUserId
				});
			});

			// 结束导航 button
			$('#hz_btn_stop_nav').click(function () {
				map.stopNavigation();
			});

		},

		// 删除 地图导航 控制面板
		removeNavigationCtrlPanel: function () {
			$('#'+this.navCtrlPanelId).remove();
		},

		// --------------------------------------------------------------------
		// 导航控制面板 功能代码 end
		// --------------------------------------------------------------------
		
		
		// --------------------------------------------------------------------
		// 电子围栏 功能代码 begin
		// --------------------------------------------------------------------

		// 使用ACE框架，创建 电子围栏控制面板
		createElectronicRailCtrlPanel: function () {
			if(document.getElementById(this.erCtrlPanelId)){ return; }  // 存在则退出函数

			this.container.append(
				'<div id="' + this.erCtrlPanelId + '" style="position:absolute; top:10px; left:'+CTRL_PANEL_LEFT+'px; z-index:1000; width:390px;">' +
				'<div class="btn-group btn-group-xs col-xs-12" id="er_hz_panel_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-danger disabled"><i class="ace-icon fa fa-square-o align-top bigger-125"></i>电子围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErAdd">新增围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErChange">修改围栏</button>'+
				'<button type="button" class="btn btn-danger" data-hz-target="#panelErDel">删除围栏</button>'+
				'<button type="button" class="btn btn-danger" id="btn_hz_queryEr">显示围栏</button>'+
				'</div>'+

				'<div class="map_panel_content col-xs-12" style="background:#FFF; border:1px solid #CCC;">'+
				'<div class="col-xs-12" style="display:none;" id="panelErAdd">'+
				'<div class="row" style="padding-right:10px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form_electRail">'+
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

			var map = this;

			if (this.isErShowing) {
				$('#btn_hz_queryEr').text('隐藏围栏');
			}

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

			this.updateErDelPanel();

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
			
			// ----------------------------------------------------------------
			// 新增 电子围栏
			var erAdd =  new HzDrawZone( {board: this.erDraftLayer});

			// 新增围栏 --> “开始绘制” 按钮
			$("#btnDrawAddEr").on('click', function () {
				var btn = $(this);
				var span = btn.find('span');
				var buttonText = span.text();
				var shape = $('#erAddDrawStyle');

				if(shape.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(erAdd,erAdd.remove_event);
						map.restoreTools.add(changeTextErAdd,btn);
						shape.attr('disabled', 'disabled');
						erAdd.polyline();
					}
				} else if(shape.val() === 'square') {      // 方形绘图
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(erAdd,erAdd.remove_square);
						map.restoreTools.add(changeTextErAdd,btn);
						shape.attr('disabled', 'disabled');
						erAdd.square();
					}
				}
			});

			function changeTextErAdd(btn){
				var span = btn.find('span');
				var buttonText = span.text();
				var shape = $('#erAddDrawStyle');
				if(shape.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						span.text('开始绘制');
						shape.removeAttr('disabled');
					} else {
						span.text('清空绘制');
						shape.attr('disabled', 'disabled');
					}
				}
				// 方形绘图
				if(shape.val() === 'square') {
					if(buttonText === '清空绘制') {
						span.text('开始绘制');
						shape.removeAttr('disabled');
					} else {
						span.text('清空绘制');
						shape.attr('disabled', 'disabled');
					}
				}
			}

			(function (factory) {
				if(typeof define === "function" && define.amd) {
					define(["jquery", ""], factory);
				} else {
					factory(jQuery);
				}
			}(function ($) {
				/*
				 * Translated default messages for the jQuery validation plugin.
				 * Locale: ZH (Chinese, 中文, 汉语, 漢語)
				 */
				$.extend($.validator.messages, {
					required: "这是必填字段",
					remote: "请修正此字段",
					email: "请输入有效的电子邮件地址",
					url: "请输入有效的网址",
					date: "请输入有效的日期",
					dateISO: "请输入有效的日期 (YYYY-MM-DD)",
					number: "请输入有效的数字",
					digits: "只能输入数字",
					creditCard: "请输入有效的信用卡号码",
					equalTo: "你的输入不相同",
					extension: "请输入有效的后缀",
					maxLength: $.validator.format("最多可以输入 {0} 个字符"),
					minLength: $.validator.format("最少要输入 {0} 个字符"),
					rangeLength: $.validator.format("请输入长度在 {0} 到 {1} 之间的字符串"),
					range: $.validator.format("请输入范围在 {0} 到 {1} 之间的数值"),
					max: $.validator.format("请输入不大于 {0} 的数值"),
					min: $.validator.format("请输入不小于 {0} 的数值")
				});
			}));
			
			$('#form_electRail').validate({
				errorElement: 'div',
				errorClass: 'help-block',
				focusInvalid: false,
				ignore: "",
				rules: {
					name: {
						required: true
					},
					floorNo: {
						required: true
					}
				},
				
				highlight: function (e) {
					$(e).closest('.form-group').removeClass('has-info').addClass('has-error');
				},
				
				success: function (e) {
					$(e).closest('.form-group').removeClass('has-error');
					$(e).remove();
				},
				
				// add 电子围栏
				submitHandler: function (form) {
					if(erAdd.points.length == 0 || erAdd.points[0] != erAdd.points[erAdd.points.length - 1]) {
						hzInfo('您没有画图');
						return;
					}
					var $form = $(form);
					var data = {
						name: $form.find("#er_name").val(),
						floorNo: $form.find("#er_floor_no").val()
					};
					
					var points = [];
					for(var i = 0; i < erAdd.points.length - 1; i++) {
						var pt = {
							x: map.coordScreenToMap(erAdd.points[i][0]),
							y: map.coordScreenToMap(erAdd.points[i][1])
						};
						points.push(pt);
					}
					data.points = points;
					
					console.log(data);
					$('#btnDrawAddEr').click();
					ajaxFormRequest({
						url: '/lbs/electronic_rail_cfg_modify',
						txData: [data],
						callback: function (data) {
							map.updateErDelPanel();
							hzInfo(data.msg);
							map.showElectronicRail();
						}
					});
				},
				invalidHandler: function (form) {}
			});

			// 修改电子围栏
			var erChange = new HzDrawZone({board: this.erDraftLayer});

			function changeTextErChange(btn){
				var span = btn.find('span');
				var buttonText = span.text();
				var oStyle = $('#erChangeDrawStyle');
				if(oStyle.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						span.text('开始绘制');
						oStyle.removeAttr('disabled');
					} else {
						span.text('清空绘制');
						oStyle.attr('disabled', 'disabled');
					}
				}
				// 方形绘图
				if(oStyle.val() === 'square') {
					if(buttonText === '清空绘制') {
						span.text('开始绘制');
						oStyle.removeAttr('disabled');
					} else {
						span.text('清空绘制');
						oStyle.attr('disabled', 'disabled');
					}
				}
			}

			$("#btnDrawChangeEr").on('click', function () {
				var $this = $(this);
				var $span = $this.find('span');
				var buttonText = $span.text();
				var oStyle = $('#erChangeDrawStyle');

				if(oStyle.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {	// 点击“开始绘制”按钮
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(erChange,erChange.remove_event);
						map.restoreTools.add(changeTextErChange,$this);
						oStyle.attr('disabled', 'disabled');
						erChange.polyline();
					}
				} else if(oStyle.val() === 'square') { // 方形绘图
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(erChange,erChange.remove_square);
						map.restoreTools.add(changeTextErChange,$this);
						oStyle.attr('disabled', 'disabled');
						erChange.square();
					}
				}
			});


			/**
			 * 修改围栏 提交 按钮点击事件
			 *
			 */
			$('#btnChangeEr').on('click',function(){
				var oErName = $('#erOldName');
				var erID = oErName.val();
				var erOldName = oErName.find("option:selected").text();
				var erNewName =  $('#erNewName').val();

				console.log('erChange.points',erChange.points);

				if(erID === 'undefined'){
					hzInfo('该围栏不能修改!');
					return false;
				} else if(erID == 0){
					hzInfo('请选择围栏!');
					return false;
				} else if(erChange.points.length > 0 && erChange.points[0] != erChange.points[erChange.points.length - 1]) {
					hzInfo('您没有画图');
					return false;
				}

				var points = [];
				for(var i = 0; i < erChange.points.length-1; i++) {
					var pt = {
						x: map.coordScreenToMap(erChange.points[i][0]),
						y: map.coordScreenToMap(erChange.points[i][1])
					};
					points.push(pt);
				}

				var txData = [{
					floorNo: 'floor3',
					id: parseInt(erID),
					points: points.length ? points : null ,
					name: (!erNewName ? erOldName: erNewName)
				}];

				ajaxFormRequest({
					url: '/lbs/electronic_rail_cfg_modify',
					txData: txData,
					callback: function (data) {
						map.updateErDelPanel();
						$('#btnDrawChangeEr').click();
						map.showElectronicRail();
						hzInfo(data.msg);
					}
				});
				return false;		// 不提交表单
			});

			// 删除电子围栏
			$('#btnErDel').on('click',function(){
				var er_item = $('#er_item');
				var items = er_item.find(':checked');

				map.restoreTools.run();

				if(items == undefined){
					hzInfo('请选择要删除的围栏!');
					return false;
				}
				var ids = [];
				items.each(function(){
					ids.push($(this).val());
				});
				var url = '/lbs/hz_data_del';
				var data = {
					who:'elect_rail_cfg',
					ids:ids
				};
				ajaxJsonRequest({
					url: url,
					txData: data,
					callback: function (data) {
						hzInfo(data.msg);
						map.updateErDelPanel();
						map.showElectronicRail();
					}
				});
			});

		},

		// 删除 电子围栏控制面板
		removeElectronicRailCtrlPanel: function () {
			$('#'+this.erCtrlPanelId).remove();
		},
		
		// 显示电子围栏
		showElectronicRail: function () {
			var map = this;
			map.isErShowing = true;
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
			this.isErShowing = false;
		},
		
		// 更新删除电子围栏界面。 ACE框架
		updateErDelPanel: function () {
			getElectronicRailCfg({
				callback: function (data) {
					var et = data.data;
					var selectHtml = '<option value="0">请选择围栏</option>';
					var checkboxHtml = '';
					for (var i = 0; i < et.length; i++){
						selectHtml += '<option value="'+et[i].id+'">'+et[i].name+'</option>';
						if(et[i].id != undefined){
							checkboxHtml += '<div class="col-xs-6"><div class="ace-settings-item"><input type="checkbox" class="ace ace-checkbox-2 ace-save-state" id="ace-settings-navbar-'+i+'" autocomplete="off" value = "'+et[i].id+'" /><label class="lbl" for="ace-settings-navbar-'+i+'">'+et[i].name+'</div></div>'}
					}
					$('#erOldName').html(selectHtml);
					$('#er_item').html(checkboxHtml);
				}
			});
		},
		
		// 画电子围栏
		drawElectronicRail: function() {
			var svg = this.erLayer.svg('get');
			svg.clear();
			
			var data = this.erData;
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
		
		// --------------------------------------------------------------------
		// 电子围栏 功能代码 end
		// --------------------------------------------------------------------
		
		
		
		// --------------------------------------------------------------------
		// 盘点区域 功能代码 begin
		// --------------------------------------------------------------------
		
		// 创建 盘点区域 控制面板
		createPeopleStatCtrlPanel: function () {
			if(document.getElementById(this.psCtrlPanelId)){ return; }  // 存在则退出函数
			this.container.append(
				'<div id="' + this.psCtrlPanelId + '" style="position:absolute; top:10px; left:'+CTRL_PANEL_LEFT+'px; z-index:1000; width:420px;">'+
				'<div class="btn-group btn-group-xs col-xs-12" id="ps_hz_panel_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-primary disabled"><i class="ace-icon fa fa-check-square-o align-top bigger-125"></i>盘点区域</button>'+
				'<button type="button" class="btn btn-primary" data-hz-target="#panelPsZoneAdd">新增</button>'+
				'<button type="button" class="btn btn-primary" data-hz-target="#panelPsZoneChange">修改</button>'+
				'<button type="button" class="btn btn-primary" data-hz-target="#panelPsZoneDel">删除</button>'+
				'<button type="button" class="btn btn-primary" id="btnPsZoneShow">显示</button>'+
				'<button type="button" class="btn btn-primary" data-hz-target="#panelPsZoneAddDefault">增加默认</button>'+
				'<button type="button" class="btn btn-primary" id="btnPsExec">立即盘点</button>'+
				'</div>'+
				
				'<div class="map_panel_content col-xs-12" style="background:#FFF; border:1px solid #CCC;">'+
				
				'<!-- 新增盘点区域 -->'+
				'<div class="col-xs-12" style="display:none; " id="panelPsZoneAdd">'+
				'<div class="row" style="padding-right:10px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form_hz_ps_add">'+
				'<div class="alert alert-info">新增盘点区域 <br />'+
				'</div>'+
				'<div class="form-group">'+
				'<label for="inventory_name" class="col-sm-3 control-label no-padding-right">盘点名称:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="inventory_name" name="name" placeholder="" />'+
				'</div>'+
				'</div>'+
				'<div class="form-group">'+
				'<label for="psZonePeopleExpect" class="col-sm-3 control-label no-padding-right">期望人数:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="psZonePeopleExpect" name="peopleNum" placeholder="" />'+
				'</div>'+
				'</div>'+
				'<div class="form-group">'+
				'<label for="hz_ps_add_draw_style" class="col-sm-3 control-label no-padding-right">绘制方式:</label>'+
				'<div class="col-sm-9">'+
				'<div class="col-xs-6">'+
				'<select class="form-control" id="hz_ps_add_draw_style">'+
				'<option value="square">方形绘图</option>'+
				'<option value="polyline">折线绘图</option>'+
				'</select>'+
				'</div>'+
				'<div class="col-xs-6">'+
				'<button type="button" id="btnDrawAddPsZone" class="btn btn-xs btn-danger"> <span>开始绘制</span> <i class="ace-icon fa fa-arrow-right icon-on-right"></i> </button>'+
				'</div>'+
				'</div>'+
				'</div>'+
				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<input type="submit" class="btn btn-success btn-xs" id="set_enclosure_submit" value="提交" />'+
				'</div>'+
				'</div>'+
				'</form>'+
				'</div>'+
				'</div>'+
				
				
				'<!-- 修改盘点区域 -->'+
				'<div class="col-xs-12" style="display:none;" id="panelPsZoneChange">'+
				'<div class="row" style="padding-right:10px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form_hz_ps_change">'+
				'<div class="alert alert-info">修改盘点区域<br />'+
				'</div>'+
				'<div class="form-group">'+
				'<label for="alter_enclosure_name" class="col-sm-3 control-label no-padding-right">修改的区域:</label>'+
				'<div class="col-sm-9">'+
				'<select class="form-control" id="alter_enclosure_name" name="name"></select>'+
				'</div>'+
				'</div>'+
				
				'<div class="form-group">'+
				'<label for="enclosure_new_name" class="col-sm-3 control-label no-padding-right">区域名称:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="enclosure_new_name" name="name" placeholder="不填为不修改!" />'+
				'</div>'+
				'</div>'+
				
				'<div class="form-group">'+
				'<label for="enclosure_new_name" class="col-sm-3 control-label no-padding-right">期望人数:</label>'+
				'<div class="col-sm-9">'+
				'<input type="text" id="enclosure_new_expectNum" name="name" placeholder="不填为不修改!" />'+
				'</div>'+
				'</div>'+
				
				
				'<div class="form-group">'+
				'<label for="hz_ps_change_draw_style" class="col-sm-3 control-label no-padding-right">绘制方式:</label>'+
				'<div class="col-sm-9">'+
				'<div class="col-xs-6">'+
				'<select class="form-control" id="hz_ps_change_draw_style">'+
				'<option value="square">方形绘图</option>'+
				'<option value="polyline">折线绘图</option>'+
				'</select>'+
				'</div>'+
				'<div class="col-xs-6">'+
				'<button type="button" id="btnDrawChangePsZone" class="btn btn-xs btn-danger"> <span>开始绘制</span> <i class="ace-icon fa fa-arrow-right icon-on-right"></i> </button>'+
				'</div>'+
				'</div>'+
				'</div>'+
				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<input type="submit" class="btn btn-success btn-xs" id="btnChangePsZone" value="提交" />'+
				'</div>'+
				'</div>'+
				'</form>'+
				'</div>'+
				'</div>'+
				
				'<!-- 删除盘点区域 -->'+
				'<div class="col-xs-12" style="display:none;" id="panelPsZoneDel">'+
				'<div class="row" style="padding-right:10px; height:200px; padding-top:3px;">'+
				'<form role="form" class="form-horizontal" id="form-validate3">'+
				'<div class="alert alert-info">删除盘点区域 <br />'+
				'</div>'+
				
				'<div class="form-group" id="enclosure_item">'+
				
				'</div>'+
				'<div class="form-group">'+
				'<div class="col-xs-6 col-xs-push-6">'+
				'<button type="button" class="btn btn-success btn-xs" id="btn_hz_ps_zone_del">删除</button>'+
				'</div>'+
				'</div>'+
				'</form>'+
				'</div>'+
				'</div>'+
				
				'<div class="col-xs-12" style="display:none;" id="panelPsZoneAddDefault">'+
				'<div class="row" style="padding-right:10px; padding-top:3px; padding-bottom:20px;">'+
				'<div class="alert alert-info">增加默认盘点区域 <br /></div>'+
				'<button id="btnAddPsZoneDefault" class="col-lg-12 btn btn-info">增加</button>'+
				'</div>'+
				'</div>'+
				'</div>'+
				'</div>'
			);

			var map = this;

			if (this.isPsShowing) {
				$('#btnPsZoneShow').text('隐藏');
			}

			/**
			 * 显示盘点结果
			 */
			function showPsResult(data) {
				console.log('showPsResult', data);
				if (data.errorCode !== 0) return;
				var psRec = data['statInfo'];
				if (psRec.length == 0) return;
				var text = '编号['+ psRec[0]['statNo'] +'] 盘点时间[' + psRec[0]['datetime'] + ']<br>';

				for(var i=0; i< psRec.length; i++) {
					if (psRec[i]['curPeopleNum'] > 0) {
						text += '区域[' + psRec[i]['roomName'] + ']  人数[' + psRec[i]['curPeopleNum'] + ']  期望人数[' + psRec[i]['expectNum'] + ']<br>'
					}
				}
				text += '其他区域，盘点人数为：0';

				$.gritter.add({
					title: '盘点结果',
					text: text,
					class_name: 'gritter-info',
					image: '/static/img/redImageMarker.png',
					sticky: true,
					time: ''
				});
			}

			// svg地图 控制面板
			$("#ps_hz_panel_button").find('button').on('click', function () {
				var btn = $(this);

				// added by wxg 2018-01-02
				if (btn.attr('id') === 'btnPsZoneShow'){
					if(btn.text() === '隐藏') {	// 隐藏 盘点区域
						btn.text('显示');
						map.hidePeopleStatZone();
					} else {	// 显示 盘点区域
						btn.text('隐藏');
						map.showPeopleStatZone();
					}
					return;
				} else if (btn.attr('id') === 'btnPsExec'){
					psExec({showMsg: false, callback: showPsResult });
					return;
				}

				if(btn.hasClass('active')) {
					ps_button_slide_up(btn);
				} else {
					ps_button_slide_down(btn)
				}
			});

			function ps_button_slide_down($this) {
				$this.addClass('active');
				$this.siblings().removeClass('active');
				var $target = $($this.attr('data-hz-target'));
				$target.siblings().slideUp('100', function () {
					$target.slideDown();
				})
			}

			function ps_button_slide_up($this) {
				$this.removeClass('active');
				var $target = $($this.attr('data-hz-target'));
				$target.slideUp();
			}

			var psZoneAdd = new HzDrawZone({board: this.psDraftLayer, penColor:'blue'});

			function changeTextPsZoneAdd($this){
				var $span = $this.find('span');
				var buttonText = $span.text();
				var shape = $('#hz_ps_add_draw_style');
				if(shape.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						$span.text('开始绘制');
						shape.removeAttr('disabled');
					} else {
						$span.text('清空绘制');
						shape.attr('disabled', 'disabled');
					}
				} else if(shape.val() === 'square') {  // 方形绘图
					if(buttonText === '清空绘制') {
						$span.text('开始绘制');
						shape.removeAttr('disabled');
					} else {
						$span.text('清空绘制');
						shape.attr('disabled', 'disabled');
					}
				}
			}
			
			// 增加 盘点区域
			$("#btnDrawAddPsZone").on('click', function () {
				var $this = $(this);
				var $span = $this.find('span');
				var buttonText = $span.text();
				var $method_select = $('#hz_ps_add_draw_style');
				if($method_select.val() === 'polyline') {
					
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(psZoneAdd,psZoneAdd.remove_event);
						map.restoreTools.add(changeTextPsZoneAdd,$this);
						$method_select.attr('disabled', 'disabled');
						psZoneAdd.polyline();
					}
				}
				// 方形绘图
				if($method_select.val() === 'square') {
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(psZoneAdd,psZoneAdd.remove_square);
						map.restoreTools.add(changeTextPsZoneAdd,$this);
						$method_select.attr('disabled', 'disabled');
						psZoneAdd.square();
					}
				}
			});
			
			var psZoneChange = new HzDrawZone({board: this.psDraftLayer, penColor:'blue'});
			
			function changeTextPsZoneChange($this){
				var $span = $this.find('span');
				var buttonText = $span.text();
				var $method_select = $('#hz_ps_change_draw_style');
				if($method_select.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						$span.text('开始绘制');
						$method_select.removeAttr('disabled');
					} else {
						$span.text('清空绘制');
						$method_select.attr('disabled', 'disabled');
					}
				} else if($method_select.val() === 'square') { // 方形绘图
					if(buttonText === '清空绘制') {
						$span.text('开始绘制');
						$method_select.removeAttr('disabled');
					} else {
						$span.text('清空绘制');
						$method_select.attr('disabled', 'disabled');
					}
				}
			}
			
			// 修改盘点区域
			$("#btnDrawChangePsZone").on('click', function () {
				var $this = $(this);
				var $span = $this.find('span');
				var buttonText = $span.text();
				var $method_select = $('#hz_ps_change_draw_style');
				if($method_select.val() === 'polyline') {
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(psZoneChange,psZoneChange.remove_event);
						map.restoreTools.add(changeTextPsZoneChange,$this);
						$method_select.attr('disabled', 'disabled');
						psZoneChange.polyline();
					}
				} else if($method_select.val() === 'square') { // 方形绘图
					if(buttonText === '清空绘制') {
						map.restoreTools.run();
					} else {
						$span.text('清空绘制');
						map.restoreTools.run();
						map.restoreTools.add(psZoneChange,psZoneChange.remove_square);
						map.restoreTools.add(changeTextPsZoneChange,$this);
						$method_select.attr('disabled', 'disabled');
						psZoneChange.square();
					}
				}
			});
			
			
			// 增加默认盘点区域
			$('#btnAddPsZoneDefault').click(function(){
				ajaxJsonRequest({
					url: '/lbs/people_stat_cfg_add_default',
					txData: {},
					callback: function (data) {
						hzInfo(data.msg);
					}
				});
				map.showPeopleStatZone();
			});
			
			// 修改盘点区域
			$('#btnChangePsZone').on('click', function () {
				var oName = $('#alter_enclosure_name');
				var psZoneId = oName.val();
				var enclosure_new_expectNum = $('#enclosure_new_expectNum').val();
				var psZoneOldName = oName.find("option:selected").text();
				var psZoneNewName = $('#enclosure_new_name').val();
				
				var psZoneChange_points = psZoneChange.points;
				
				console.log('psZoneChange_points', psZoneChange_points);
				if(psZoneId == 'undefined') {
					hzInfo('该盘点区域不能修改!');
					return false;
				}
				
				if(psZoneId == 0) {
					hzInfo('请选择盘点区域!');
					return false;
				}
				if(psZoneChange.points.length > 0 && psZoneChange.points[0] != psZoneChange.points[psZoneChange.points.length - 1]) {
					hzInfo('您没有画图');
					return false;
				}
				
				var pointsToServer = [];
				
				var points_length = psZoneChange_points.length - 1;
				for(var i = 0; i < points_length; i++) {
					var pt = {
						x: map.coordScreenToMap(psZoneChange.points[i][0]),
						y: map.coordScreenToMap(psZoneChange.points[i][1])
					};
					pointsToServer.push(pt);
				}
				
				var data = {
					id: parseInt(psZoneId)
				};
				
				if(psZoneNewName == '') {
					data.name = psZoneOldName;
				} else {
					data.name = psZoneNewName;
				}
				
				if(enclosure_new_expectNum != ''){
					data.expectNum = enclosure_new_expectNum;
				}
				
				if (pointsToServer.length > 0)
					data.points = pointsToServer;
				
				console.log('btnChangePsZone, send data=', data);
				ajaxJsonRequest({
					url: '/lbs/people_stat_cfg_chg',
					txData: {data: [data] },
					callback: function (data) {
						updatePsDelPanel();
						$('#btnDrawChangePsZone').click();
						map.showPeopleStatZone();
						hzInfo(data.msg);
					}
				});
				return false;		// 不提交表单
			});

			// 更新盘点区域删除面板。增加 盘点区域 复选框
			function updatePsDelPanel(){
				var url = '/lbs/people_stat_cfg_get';
				var txData = {
					rows:200
				};
				ajaxJsonRequest({
					url: url,
					txData: txData,
					callback: function (data) {
						var dataData = data.data.rows;
						var dataDataLength = dataData.length;
						var selectHtml = '<option value="0">请选择盘点区域</option>';
						var checkboxHtml = '';
						for (var i = 0; i<dataDataLength; i++){
							selectHtml += '<option value="'+dataData[i].id+'">'+dataData[i].name+'</option>';
							if(dataData[i].id != undefined){
								checkboxHtml += '<div class="col-xs-6"><div class="ace-settings-item"><input type="checkbox" class="ace ace-checkbox-2 ace-save-state" id="ace-settings-navbar-' + i + '" autocomplete="off" value="'+dataData[i].id+'" /><label class="lbl" for="ace-settings-navbar-'+i+'">'+dataData[i].name+'</div></div>'}
						}
						$('#alter_enclosure_name').html(selectHtml);
						$('#enclosure_item').html(checkboxHtml);
					}
				});
			}

			updatePsDelPanel();

			// 增加盘点区域 submit button
			$('#form_hz_ps_add').validate({
				errorElement: 'div',
				errorClass: 'help-block',
				focusInvalid: false,
				ignore: "",
				rules: {
					name: {
						required: true
					},
					expectNum: {
						digits: true
					}
				},

				highlight: function (e) {
					$(e).closest('.form-group').removeClass('has-info').addClass('has-error');
				},

				success: function (e) {
					$(e).closest('.form-group').removeClass('has-error');
					$(e).remove();
				},


				submitHandler: function (form) {
					if(psZoneAdd.points[0] == undefined || psZoneAdd.points[0] != psZoneAdd.points[psZoneAdd.points.length - 1]) {
						hzInfo('您没有画图');
						return;
					}

					var $form = $(form);
					var data = {
						name: $form.find("#inventory_name").val()
					};

					var peopleNum = $form.find("#psZonePeopleExpect").val();
					if(peopleNum) {
						data.expectNum = parseInt(peopleNum);
					}

					var points = [];
					var points_length = psZoneAdd.points.length - 1;
					for(var i = 0; i < points_length; i++) {
						var pt = {
							x: map.coordScreenToMap(psZoneAdd.points[i][0]),
							y: map.coordScreenToMap(psZoneAdd.points[i][1])
						};
						points.push(pt);
					}
					data.points = points;

					$('#btnDrawAddPsZone').click();
					console.log('submitHandler send data=', data);

					ajaxJsonRequest({
						url: '/lbs/people_stat_cfg_add',
						txData: { data: [data] },
						callback: function (data) {
							updatePsDelPanel();
							map.showPeopleStatZone();
							hzInfo(data.msg);
						}
					});
				},
				invalidHandler: function (form) {}
			});

			$('#btn_hz_ps_zone_del').on('click',function(){
				var $enclosure_item = $('#enclosure_item');
				var items = $enclosure_item.find(':checked');

				map.restoreTools.run();

				if(items == undefined){
					hzInfo('请选择要删除的盘点区域!');
					return false;
				}
				var ids = [];
				items.each(function(){
					ids.push($(this).val());
				});

				var url = '/lbs/hz_data_del';
				var data = {
					who:'people_stat_cfg',
					ids:ids
				};
				console.log('btn_hz_ps_zone_del send data:',data);
				ajaxJsonRequest({
					url: url,
					txData: data,
					callback: function (data) {
						map.showPeopleStatZone();
						updatePsDelPanel();
						hzInfo(data.msg);
					}
				});
			});
			
		},
		
		// 删除 盘点区域 控制面板
		removePeopleStatCtrlPanel: function () {
			$('#'+this.psCtrlPanelId).remove();
		},
		
		// 显示盘点区域
		showPeopleStatZone: function () {
			var map = this;
			this.isPsShowing = true;
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
			this.isPsShowing = false;
		},
		// 画盘点区域
		drawPeopleStatZone:function () {
			var svg = this.psLayer.svg('get');
			svg.clear();
			
			var data = this.psZoneData;
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
		
		// --------------------------------------------------------------------
		// 盘点区域 功能代码 end
		// --------------------------------------------------------------------

		
		// 开始导航
		startNavigation: function (options) {
			this.socket.emit('hz_navigating',
				{'location': options.location, 'userId': options.userId });

			this.tools.setNavStatus(true);
			this.tools.setDestination(options.location);
			this.tools.setNavUserId(options.userId);

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
			
			this.tools.setNavStatus(false);
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
