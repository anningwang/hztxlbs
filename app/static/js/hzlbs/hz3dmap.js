/**
 * Created by WXG on 2018/1/24.
 */


(function(window){
	'use strict';

	var hzlbs = window['hzlbs'] || {};
	if( !('hzlbs' in window) ) window['hzlbs'] = hzlbs;

	hzlbs.Hello = new function() {
		var self = this;
		var name = 'world';
		self.sayHello = function (_name) {
			return 'Hello ' + (_name || name);
		};
	};

	hzlbs.Hz3DMap = function (options) {
		options = options || {};
		if (!options.container) { return; }
		
		this.tools = HzTools;
		
		this.container = options.container;     // JQuery 对象
		this.restoreService = new Init();   // 业务控制面板按钮间初始化对象
		this.serviceCtrlPanelId = 'hz_service_ctrl_panel';
		
		
		// 创建地图导航控制面板
		if(options['showNavCtrlPanel']) { this.createNavigationCtrlPanel(); }
		
		// 创建 业务（电子围栏、人员盘点等）控制面板
		if(options.showServicePanel) { this.createServicePanel(); }
	};
	
	hzlbs.Hz3DMap.prototype = {
		constructor: hzlbs.Hz3DMap,  // 构造函数
		
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
		
		
		// --------------------------------------------------------------------
		// 导航控制面板 功能代码 begin
		// --------------------------------------------------------------------
		
		// 使用ACE框架，创建 导航控制面板
		createNavigationCtrlPanel: function () {
			if (document.getElementById(this.navCtrlPanelId)) { return; }  // 存在则退出函数
			
			this.container.append(
				'<div id="' + this.navCtrlPanelId + '" style="position:absolute; top:10px; left:120px; z-index:1000; width:370px;">'+
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
				if(!map.tools.selectUserId) {
					hzInfo('请在地图上选择要导航的用户。');
					return;
				}
				map.startNavigation({
					location: $('#hz_nav_dest').val(),
					userId: map.tools.selectUserId ||  '1918E00103AA'
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
		}
		
		// --------------------------------------------------------------------
		// 导航控制面板 功能代码 end
		// --------------------------------------------------------------------
		
	}

})(window);