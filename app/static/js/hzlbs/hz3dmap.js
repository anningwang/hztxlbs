/**
 * Created by WXG on 2018/1/24.
 */


(function(window){
	'use strict';

	var hzlbs = window['hzlbs'] || {};
	if( !('hzlbs' in window) ) window['hzlbs'] = hzlbs;

	var fmapID = 'hztx-hy-f3'; // mapId

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
		
		var self = this;
		
		this.tools = HzTools;
		
		this.container = options.container; // JQuery 对象
		this.restoreService = new Init();   // 业务控制面板按钮间初始化对象
		this.serviceCtrlPanelId = 'hz_service_ctrl_panel';
		this.fmapContainerId = options.fmapContainerId;
		this.isNavigating = false;  // 是否处于模拟导航状态
		this.destCoord = undefined;  // 导航目的地
		this.userList = {};          // 用户列表 { userId: HzPeople }

		// 创建 3D 地图
		this.createFmap();

		// 地图加载完成回调方法
		this.loadComplete();

		// 地图点击事件
		this.mapClickNode();
		
		// 创建地图导航控制面板
		if(options['showNavCtrlPanel']) { self.createNavigationCtrlPanel(); }
		
		// 创建 业务（电子围栏、人员盘点等）控制面板
		if(options.showServicePanel) { self.createServicePanel(); }
	};
	
	hzlbs.Hz3DMap.prototype = {
		constructor: hzlbs.Hz3DMap,  // 构造函数
		
		// --------------------------------------------------------------------
		// 业务工具面板 功能代码 begin
		// --------------------------------------------------------------------

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

				self.socket = io.connect(Hzlbs.HZ_CONN_STR);
				// 增加定位代码，实时显示人物位置
				self.socket.on('hz_position', function (msg) {
					console.log('hz_position', msg);
					for(var i = 0; i < msg.length; i++) {
						var fm_coord = Hzlbs.coordMapToFMap({x: msg[i].x, y: msg[i].y});
						self.addPeople({id: msg[i].userId, x: fm_coord.x, y: fm_coord.y});
					}
				});
			});
		},

		mapClickNode: function () {
			var self = this;
			this.fmap.on('mapClickNode',function(event) {
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
						console.log('no label', coord);
					} else {
						coord = {
							x: modelLabel.mapCoord.x,
							y: modelLabel.mapCoord.y,
							groupID: event.groupID
						};

						console.log('has label', coord);
					}

					coord = {
						x: event.mapCoord.x,
						y: event.mapCoord.y,
						groupID: event.groupID
					};
					console.log('navi', coord);

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

			//this.tools.setNavStatus(false);
		},

		// --------------------------------------------------------------------
		// 3d map(fmap) 功能代码 begin
		// --------------------------------------------------------------------
		// 添加Marker
		addMarker: function (coord, color) {
			color = color || 'blue';        // 默认blue色
			// 获取焦点层
			var map = this.fmap;
			var currentGid = map.focusGroupID;
			var group = map.getFMGroup(currentGid);
			
			if(!group) return;
			
			// 返回当前层中第一个imageMarkerLayer,如果没有，则自动创建
			var layer = group.getOrCreateLayer('imageMarker');
			
			// 图标标注对象，默认位置为该楼层中心点
			var im = new fengmap.FMImageMarker({
				x: coord.x,
				y: coord.y,

				// 设置图片路径
				url: color === 'blue' ? '/static/img/blueImageMarker.png' : '/static/img/redImageMarker.png',
				// 设置图片显示尺寸
				size: 32,
				height: 0.5,
				callback: function() {
					// 在图片载入完成后，设置 "一直可见"
					im.alwaysShow();
				}
			});

			layer.addMarker(im);
			return im;
		},

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
		}
		// --------------------------------------------------------------------
		// 3d map(fmap) 功能代码 end
		// --------------------------------------------------------------------

	
	};   // end of hzlbs.Hz3DMap.prototype

	//-------------------------------------------------------------------------
	// begin of HzPeople
	//-------------------------------------------------------------------------
	function HzPeople(map, options) {
		options = options || {};
		this.id = options.id;
		this.text = options.text;
		this.x = options.x;
		this.y = options.y;
		this.map = map;
		this.img = options.img || '/static/img/blueImageMarker.png';
		this.imageMarker = null;

		this.renderer();

		if(map.tools.selectUserId == this.id) { this.select();  }
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

		getPosition: function () {
			return this.imageMarker.getPosition();
		},

		renderer: function () {
			this.imageMarker = this.addMarker();
		},

		moveTo: function (x, y) { // x,y 为 地图坐标

		},

		// 选中用户
		select: function () {
			this.imageMarker.url = '/static/img/redImageMarker.png';
			this.map.tools.setSelectUserId(this.getId());
		},

		unselect: function () {
			this.imageMarker.url = '/static/img/blueImageMarker.png';
			this.map.tools.setSelectUserId('');
		},

		addMarker: function () {
			// 获取焦点层
			var fmap = this.map.fmap;
			var currentGid = fmap.focusGroupID;
			var group = fmap.getFMGroup(currentGid);

			if(!group) return null;

			// 返回当前层中第一个imageMarkerLayer,如果没有，则自动创建
			var layer = group.getOrCreateLayer('imageMarker');

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

			layer.addMarker(im);
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