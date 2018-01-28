/**
 * Created by WXG on 2018/1/24.
 */


(function(window){
	'use strict';

	if( !('hzlbs' in window) ) window['hzlbs'] = {};
	var hzlbs = window['hzlbs'];

	var fmapID = 'hztx-hy-f3'; // mapId
	
	// 坐标转换 简化公式
	var _locOrigin = {'x':0,'y':0};          // 定位坐标原点
	var _locRange = {'x':39023,'y':19854};   // 定位范围
	var _mapOrigin = {'x':12531716.588,'y':3101784.7414};
	var _mapRange = {'x':12531761.921,'y':3101761.9051};

	hzlbs.Hello = new function() {
		var self = this;
		var name = 'world';
		self.sayHello = function (_name) {
			return 'Hello ' + (_name || name);
		};
	};

	var CTRL_PANEL_LEFT = 120;

	hzlbs.Hz3DMap = function (options) {
		options = options || {};
		if (!options.container) { return; }
		
		var self = this;
		this.tools = hzlbs.HzTools;
		this.container = options.container; // JQuery 对象
		this.restoreTools = new hzlbs.Util.Init();     // 恢复工具类，恢复每次绘图的状态
		this.restoreService = new hzlbs.Util.Init();   // 业务控制面板按钮间初始化对象
		this.erLayer = null;
		this.psLayer = null;
		this.hisLocLayer = null;
		this.pathLayer = null;
		this.serviceCtrlPanelId = 'hz_service_ctrl_panel';
		this.fmapContainerId = options.fmapContainerId;
		this.isNavigating = false;  // 是否处于模拟导航状态
		this.destCoord = undefined;  // 导航目的地
		this.userList = {};          // 用户列表 { userId: HzPeople }
		this.erData = undefined;        // 电子围栏信息
		this.psZoneData = undefined;    // 盘点区域数据
		this.hisLocData = undefined;    // 历史轨迹
		this.hisLocData = undefined;    // 历史轨迹
		this.hisLocLines = [];          // 历史轨迹路线

		this.erCtrlPanelId = 'hz_map_controller_panel_er';
		this.isErShowing = false;   // 电子围栏处于“显示”状态。
		if (options.showErZone) { this.showElectronicRail(); }
		this.psCtrlPanelId = 'hz_map_controller_panel_ps';
		this.isPsShowing = false;   // 盘点区域 处于“显示”状态。
		if (options.showPsZone) { this.showPeopleStatZone(); }
		this.navCtrlPanelId = 'hz_map_controller_panel_nav';
		this.hisLocCtrlPanelId = 'hz_map_controller_panel_hisLoc';

		this.setLineStyle();

		// 创建 3D 地图
		this.createFmap();

		// 地图加载完成回调方法
		this.loadComplete();

		// 地图点击事件
		this.mapClickNode();
		
		// 创建地图导航控制面板
		if(options['showNavCtrlPanel']) { self.createNavigationCtrlPanel(); }

		// 创建历史轨迹控制面板
		if(options['showHisLocCtrlPanel']) { this.createHistoryLocationCtrlPanel();  }

		// 创建电子围栏控制面板
		if(options['showERCtrlPanel']) { this.createElectronicRailCtrlPanel(); }
		
		// 创建盘点区域控制面板
		if(options['showPSCtrlPanel']) { this.createPeopleStatCtrlPanel(); }
		
		// 创建 业务（电子围栏、人员盘点等）控制面板
		if(options.showServicePanel) { self.createServicePanel(); }
	};
	
	hzlbs.Hz3DMap.prototype = {
		constructor: hzlbs.Hz3DMap,  // 构造函数
		
		// 地图坐标 转 FMap 坐标
		coordMapToFMap: function (coord) {
			var x = (coord.x - _locOrigin.x)/ (_locRange.x - _locOrigin.x) * (_mapRange.x - _mapOrigin.x) + _mapOrigin.x;
			var y = (coord.y - _locOrigin.y) / (_locRange.y - _locOrigin.x) * (_mapRange.y - _mapOrigin.y) + _mapOrigin.y;
			
			return {'x': x, 'y': y};
		},

		addPeople: function (options) {
			options = options || {};
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
			return this.getPeople(this.tools.selectUserId);
		},

		// --------------------------------------------------------------------
		// 业务工具面板 功能代码 begin
		// --------------------------------------------------------------------

		// 创建 业务工具面板。 使用ACE框架。
		createServicePanel: function () {
			if(document.getElementById(this.serviceCtrlPanelId)){ return; }  // 存在则退出函数
			this.container.append(
				'<div id="'+ this.serviceCtrlPanelId + '" style="position:absolute; top:200px; left: 10px; z-index:1000;">' +
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


		isNaviCtrlPanelShowing: function () {
			return (document.getElementById(this.navCtrlPanelId))
		},
		
		// --------------------------------------------------------------------
		// 导航控制面板 功能代码 begin
		// --------------------------------------------------------------------
		
		// 使用ACE框架，创建 导航控制面板
		createNavigationCtrlPanel: function () {
			if (document.getElementById(this.navCtrlPanelId)) { return; }  // 存在则退出函数
			
			this.container.append(
				'<div id="' + this.navCtrlPanelId + '" style="position:absolute; top:10px; left:'+ CTRL_PANEL_LEFT +'px; z-index:1000; width:370px;">'+
				'<div class="btn-group btn-group-xs col-xs-12" id="hz_panel_nav_button" style="background:#FFF; border:1px solid #CCC;">'+
				'<button type="button" class="btn btn-pink disabled"><i class="ace-icon fa fa-road align-top bigger-125"></i>导航</button>'+
				'<select id="hz_nav_user" class="btn btn-pink" name="locations" style="font-family:Verdana,sans-serif;" title="用户">'+
				'<option value="0" selected >请选择用户</option>'+
				'<option value="1918E00103AA">1918E00103AA</option>'+
				'<option value="1918E00103A9">1918E00103A9</option>'+
				'</select>'+
				'<button type="button" class="btn btn-pink" id="hz_btn_begin_nav" >模拟导航</button>'+
				'<button type="button" class="btn btn-pink" id="hz_btn_stop_nav">结束导航</button>'+
				'</div>'+
				'</div>'
			);
			var map = this;

			var oUserId = $("#hz_nav_user");
			oUserId.val(this.tools.selectUserId == '' ? '0' : this.tools.selectUserId );

			oUserId.change(function () {
				var val = $(this).val();

				var curPeople = map.getSelectPeople();
				if (curPeople) { curPeople.unselect();  }
				var people = map.getPeople(val);
				if (people) { people.select();  }

				map.tools.setSelectUserId(val == '0' ? '' : val);   // 保存当前选择用户
			});
			
			// 开始导航 button
			$('#hz_btn_begin_nav').click(function () {
				if(!map.tools.selectUserId) {
					hzInfo('请选择要导航的用户。');
					return;
				}

				if (!map.destCoord) {
					hzInfo('请点击地图选择<span style="color:red;font-size:16px;"><strong>目的地</strong></span>。');
					return;
				}

				if(map.navi) {
					map.isNavigating = true;
					map.navi.simulate();
				}
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


		// 停止导航
		stopNavigation: function () {
			if(this.navi) {
				this.navi.stop();
				this.navi.clearAll();
				this.fmap.mapScaleLevel = 22;
				this.fmap.tiltAngle = 30;
				this.fmap.moveToCenter();
			}
			this.isNavigating = false;
			this.destCoord = undefined;
			if (this.pathLayer) { this.pathLayer.removeAll(); }

			//this.tools.setNavStatus(false);
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

		// --------------------------------------------------------------------
		// 历史轨迹控制面板 功能代码 end
		// --------------------------------------------------------------------

		// 画历史轨迹
		drawHistoryLocation: function (data) {
			if (data) { this.hisLocData = data; }
			else { data = this.hisLocData; }

			// 获取第一层
			var group = this.fmap.getFMGroup(this.fmap.groupIDs[0]);
			if (!this.hisLocLayer) {
				this.hisLocLayer = new fengmap.FMImageMarkerLayer();
				group.addLayer(this.hisLocLayer);
			}
			this.hisLocLayer.removeAll();

			this.fmap.clearLineMark();
			// 生成历史轨迹线坐标点
			var hisLocResults = [{
				groupId: 1,
				points: []
			}];

			for(var key in data) {
				if (!data.hasOwnProperty(key)) continue;
				var points = [];
				for (var m=0; m< data[key].length; m++) {
					var fm_coord = this.coordMapToFMap(data[key][m]);
					points.push({x: fm_coord.x, y: fm_coord.y, z: 0.2})
				}
				console.log(data, points);
				hisLocResults[0].points = points;
				this.drawLines(hisLocResults, this.lineStyle[0]);

				// 添加历史轨迹起点和终点标识
				this.addImageMarker(this.hisLocLayer, points[0], '/static/img/start.png' );
				this.addImageMarker(this.hisLocLayer, points[points.length-1], '/static/img/end.png' );
			}
		},
		addImageMarker: function (layer, point, img) {
			var im = new fengmap.FMImageMarker({
				x: point.x,
				y: point.y,
				// 设置图片路径
				url: img || '/static/img/start.png',
				// 设置图片显示尺寸
				size: 32,
				height: 0.5,
				callback: function() {
					// 在图片载入完成后，设置 "一直可见"
					im.alwaysShow();
					// times为次数，0为无限循环。
					// duration为跳跃一次所使用的时间，默认为1.
					// delay为每次跳跃的间隔，默认为0.
					//  height为跳跃的高度，默认为8米。
					im.jump({
						times: 0,
						duration: 2,
						delay: 0.5,
						height: 2
					});
				}
			});
			layer.addMarker(im);
			return im;
		},

		// 清除历史轨迹
		clearHistoryLocation: function () {
			this.hisLocData = undefined;
			// 方法一：清除所有路径线
			this.fmap.clearLineMark();
			if (this.hisLocLayer) { this.hisLocLayer.removeAll(); }
		},

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
				}
			});
		},
		// 隐藏电子围栏
		hideElectronicRail: function () {
			this.erData = undefined;
			this.isErShowing = false;
			if (this.erLayer) { this.erLayer.removeAll(); }
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
			var data = this.erData;
			// 获取第一层
			var group = this.fmap.getFMGroup(this.fmap.groupIDs[0]);
			if (!this.erLayer) {
				this.erLayer = new fengmap.FMPolygonMarkerLayer();
				group.addLayer(this.erLayer);
			}
			this.erLayer.removeAll();

			for(var k = 0; k < data.length; k++) {
				var pts = data[k].points;
				var points = [];

				for (var i = 0; i < pts.length; i++) {
					var fm_coord = this.coordMapToFMap({x: pts[i].x, y: pts[i].y});
					points.push({
						x: fm_coord.x,
						y: fm_coord.y,
						z: 0.5
					});
				}

				/*
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
				*/

				var polygonMarker = new fengmap.FMPolygonMarker({
					// 设置颜色
					color: 'red',
					// 设置透明度
					alpha: .3,
					// 设置边框线的宽度
					lineWidth: 3,
					// 设置高度
					height: 0.5,
					// 设置电子围栏的坐标点
					points: points
				});
				this.erLayer.addMarker(polygonMarker);
			}
		},

		// 删除 电子围栏控制面板
		removeHistoryLocationCtrlPanel: function () {
			$('#'+this.hisLocCtrlPanelId).remove();
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
				}
			});
		},
		// 隐藏盘点区域
		hidePeopleStatZone: function () {
			this.psZoneData = undefined;
			this.psLayer.removeAll();
			this.isPsShowing = false;
		},
		// 画盘点区域
		drawPeopleStatZone:function () {
			var data = this.psZoneData;

			// 获取第一层
			var group = this.fmap.getFMGroup(this.fmap.groupIDs[0]);
			if (!this.psLayer) {
				this.psLayer = new fengmap.FMPolygonMarkerLayer();
				group.addLayer(this.psLayer);
			}
			this.psLayer.removeAll();

			for(var k = 0; k < data.length; k++) {
				var pts = data[k].points;
				var points = [];

				for (var i = 0; i < pts.length; i++) {
					var fm_coord = this.coordMapToFMap({x: pts[i].x, y: pts[i].y});
					points.push({
						x: fm_coord.x,
						y: fm_coord.y,
						z: 0.5
					});
				}

				var polygonMarker = new fengmap.FMPolygonMarker({
					// 设置颜色
					color: 'blue',
					// 设置透明度
					alpha: .3,
					// 设置边框线的宽度
					lineWidth: 3,
					// 设置高度
					height: 0.5,
					// 设置电子围栏的坐标点
					points: points
				});
				this.psLayer.addMarker(polygonMarker);
			}
		},
		
		// --------------------------------------------------------------------
		// 盘点区域 功能代码 end
		// --------------------------------------------------------------------
		

		// --------------------------------------------------------------------
		// 3d map(fmap) 功能代码 begin
		// --------------------------------------------------------------------

		// 创建 3D 地图
		createFmap: function () {
			var fmap = new fengmap.FMMap({
				container: document.getElementById(this.fmapContainerId), // 渲染dom
				// 开发者申请应用名称
				appName:'hztxLbs',
				// 开发者申请应用下web服务的key
				key:'0a6829a356caea4bb98fa0f2dea423ed',
				// 主题数据位置
				mapThemeURL : '/static/js/fmap/data/theme',
				// [15, 29], 比例尺级别范围， 16级到23级
				// mapScaleLevelRange: [16, 23],
				// 默认比例尺级别  内部创建的1-29级的比例尺级别
				defaultMapScaleLevel: 22
			});

			// 打开Fengmap服务器的地图数据和主题
			fmap.openMapById(fmapID);
			fmap.showCompass = true; // 显示指北针控件
			var ctlOpt1 = new fengmap.controlOptions({
				position: fengmap.controlPositon.LEFT_TOP, // 位置 左上角
				// 位置x,y的偏移量
				offset: {x: 20, y: 60},
				imgURL: '/static/img/',
				// 点击放大、缩小控件回调的方法
				scaleLevelcallback:function(level,result) {}
			});
			// 放大、缩小控件
			// fmap 为FMMap对象，初始化需在地图加载后完成。
			this.zoomControl = new fengmap.zoomControl(fmap, ctlOpt1);
			this.fmap = fmap;
			return fmap;
		},

		// 地图加载完成回掉方法
		loadComplete: function(){
			var self = this;
			this.fmap.on('loadComplete',function() {
				self.toolControl = new fengmap.toolControl(self.fmap, {
					// 初始化2D模式
					init2D: false,
					// 设置为false表示只显示2D,3D切换按钮
					groupsButtonNeeded: false,
					imgURL: '/static/img/',
					// 点击按钮的回调方法,返回type表示按钮类型,value表示对应的功能值
					clickCallBack: function(type, value) {
						// console.log(type,value);
					}
				});

				self.socket = io.connect(hzlbs.CONST.HZ_CONN_STR);
				// 增加定位代码，实时显示人物位置
				self.socket.on('hz_position', function (msg) {
					console.log('hz_position', msg);
					for(var i = 0; i < msg.length; i++) {
						var fm_coord = self.coordMapToFMap({x: msg[i].x, y: msg[i].y});

						var people = self.getPeople(msg[i].userId);
						if (people){
							people.moveTo(fm_coord.x, fm_coord.y);
							// 如果已经画出了导航路径，则更新路径的起点
							if (self.destCoord && self.tools.selectUserId == people.getId()) {
								var naviCoord = [{x: fm_coord.x, y: fm_coord.y, groupID: self.destCoord.groupID }, self.destCoord];
								self.createNavi(naviCoord);
							}
						} else {
							self.addPeople({id: msg[i].userId, x: fm_coord.x, y: fm_coord.y});
						}
					}
				});


				// 电子围栏信息
				self.socket.on('hz_electronic_tail', function (msg) {
					//console.log('电子围栏：', msg);
					for (var i=0; i< msg.length; i++){
						var state = (msg[i].status == 1) ? '进入': '离开';
						gritter_alert('电子围栏警报', '用户ID【' + msg[i].userId + '】 '+
							msg[i].datetime +' 【'+ state + '】了电子围栏【' + msg[i].name + '】');
					}
				});

			});
		},

		mapClickNode: function () {
			var self = this;
			this.fmap.on('mapClickNode',function(event) {
				if (!self.isNaviCtrlPanelShowing()) { return; }
				if (self.isNavigating) { return; }

				if (event.nodeType == fengmap.FMNodeType.MODEL) {
					var modelLabel = event.label;
					var coord;

					// 如果拾取的模型没有Label对象，则使用模型中心点的坐标
					// 有则使用与模型对应的Label对象的坐标。
					if (!modelLabel) {
						coord = {
							x: event.mapCoord.x,
							y: event.mapCoord.y,
							groupID: event.groupID
						};
					} else {
						coord = {
							x: modelLabel.mapCoord.x,
							y: modelLabel.mapCoord.y,
							groupID: event.groupID
						};
					}

					var naviCoord = [];
					var people = self.getSelectPeople();
					if (people) {
						naviCoord[0] = people.getPosition();
					} else {
						hzInfo('请选择用户。');
						return;
					}

					naviCoord[1] = coord;
					self.destCoord = coord;

					// 判断起点和终点是否相同
					if (naviCoord[0].x == coord.x) {
						hzInfo('起点和终点相同，请重新选择终点。');
						return;
					}

					self.createNavi(naviCoord);
				}
			});
		},

		// 创建导航路线. isShowStartPoint true，显示 起点marker； false(default)，不显示起点marker
		createNavi: function (coord, isShowStartPoint) {
			isShowStartPoint = (isShowStartPoint === true); // default: false
			if (!this.navi) {
				// 初始化导航对象
				this.navi = new fengmap.FMNavigation({
					map: this.fmap,
					locationMarkerUrl: '/static/img/pointer.png',
					//设置Marker尺寸
					locationMarkerSize: 43,
					//设置地图是否选择，默认false
					//followAngle: true,
					//导航跟随倾斜角度
					tiltAngle: 60,
					//导航跟随显示级别
					scaleLevel: 0,
					// 设置导航线的样式
					lineStyle: {
						// 导航线样式
						lineType: fengmap.FMLineType.FMARROW,
						// 设置线的宽度
						lineWidth: 6
						//设置线的颜色
						// godColor: '#FF0000',
						//设置边线的颜色
						// godEdgeColor: '#920000',
					}
				});

				// 导航路径结束事件
				this.navi.on('complete',function() {
					hzTip('已到目的地，导航结束。');
				});
			}
			this.navi.clearAll();
			// 添加起点
			this.navi.setStartPoint({
				x: coord[0].x,
				y: coord[0].y,
				groupID: coord[0].groupID,
				url: isShowStartPoint ? '/static/img/start.png': '',
				height: 0.5,
				size: 32
			});

			// 添加终点
			this.navi.setEndPoint({
				x: coord[1].x,
				y: coord[1].y,
				groupID: coord[1].groupID,
				url: '/static/img/end.png',
				height: 0.5,
				size: 32
			});

			// 画出导航线
			this.navi.drawNaviLine();
		},

		setLineStyle: function () {
			// 配置线型、线宽、透明度等
			var lineStyle = {
				// 设置线的宽度
				lineWidth: 4,
				// 设置线的透明度
				alpha: 0.8,
				// offsetHeight 默认的高度为 1, (离楼板1米的高度)
				offsetHeight: 1,
				// 设置线的类型为导航线
				lineType: fengmap.FMLineType.FMARROW,
				godColor: '#FF0000',
				// 设置线动画,false为动画
				noAnimate: false
			};

			// 配置线型、颜色、线宽、透明度等
			var lineStyle2 = {
				// 设置线的颜色
				color: 'BlueViolet',
				// 设置线的宽度
				lineWidth: 4,
				// 设置线的透明度
				alpha: 0.8,
				// offsetHeight 默认的高度为 1, (离楼板1米的高度)
				offsetHeight: 1,
				// 设置线的类型
				lineType: fengmap.FMLineType.DOUBLE_DOT_DASH, // CENTER  DASH  DOT_DASH  DOTTED DOUBLE_DOT_DASH  FMARROW  FULL TRI_DOT_DASH
				dash: {
					// 设置线的大小
					size: 5,
					// 0为实线，大于0为虚线
					gap: 0
				}
			};

			this.lineStyle = [lineStyle, lineStyle2];
		},

		// 绘制线图层
		drawLines : function (results, lineStyle) {
			lineStyle = lineStyle || this.lineStyle[0];
			// 绘制部分
			var line = new fengmap.FMLineMarker();
			for (var i = 0; i < results.length; i++) {
				var result = results[i];
				var gid = result.groupId;
				var points = result.points;
				var seg = new fengmap.FMSegment();
				seg.groupId = gid;
				seg.points = points;
				line.addSegment(seg);
				var lineObject = this.fmap.drawLineMark(line, lineStyle);
				this.hisLocLines.push(lineObject);
			}
		}

		// --------------------------------------------------------------------
		// 3d map(fmap) 功能代码 end
		// --------------------------------------------------------------------

	
	};   // end of hzlbs.Hz3DMap.prototype

	//-------------------------------------------------------------------------
	// begin of HzPeople
	//-------------------------------------------------------------------------
	var _SELECT_IMG = '/static/img/redImageMarker.png';
	var _UNSELECT_IMG = '/static/img/blueImageMarker.png';
	function HzPeople(map, options) {
		options = options || {};
		this.id = options.id;
		this.text = options.text;
		this.x = options.x;
		this.y = options.y;
		this.map = map;
		this.img = options.img || _UNSELECT_IMG;
		this.imageMarker = null;

		this.renderer();
	}

	HzPeople.prototype = {
		constructor: HzPeople,  // 构造函数

		getId: function () {
			return this.id;
		},

		setText: function (text) {
			this.text = text;
		},

		setPosition: function (x, y) {  // x,y 为 地图坐标
			this.x = x;
			this.y = y;
			this.imageMarker.setPosition(x, y);
		},

		getPosition: function () {
			return this.imageMarker.getPosition();
		},

		renderer: function () {
			this.imageMarker = this.addMarker();
		},

		moveTo: function (x, y) { // x,y 为 地图坐标
			this.x = x;
			this.y = y;
			this.imageMarker.moveTo({
				x: x,
				y: y,
				time: 0.2
			});
		},

		// 选中用户
		select: function () {
			this.imageMarker.url = _SELECT_IMG;
			this.map.tools.setSelectUserId(this.getId());
		},

		unselect: function () {
			this.imageMarker.url = _UNSELECT_IMG;
			this.map.tools.setSelectUserId('');
		},

		addMarker: function () {
			var fmap = this.map.fmap;
			var group = fmap.getFMGroup(fmap.groupIDs[0]);

			if(!this.map.userLayer) {
				this.map.userLayer = new fengmap.FMImageMarkerLayer();
				group.addLayer(this.map.userLayer);
			}

			// 图标标注对象，默认位置为该楼层中心点
			var im = new fengmap.FMImageMarker({
				x: this.x,
				y: this.y,

				// 设置图片路径
				url: this.img,
				// 设置图片显示尺寸
				size: 32,
				height: 0.5,
				callback: function() {
					// 在图片载入完成后，设置 "一直可见"
					im.alwaysShow();
				}
			});

			if(this.map.tools.selectUserId == this.id) { im.url = _SELECT_IMG; }

			this.map.userLayer.addMarker(im);
			return im;
		},

		destroy: function () {
			this.imgContainer.remove();
			this.textContainer.remove();
		}
	};

	//-------------------------------------------------------------------------
	// end of HzPeople
	//-------------------------------------------------------------------------

})(window);