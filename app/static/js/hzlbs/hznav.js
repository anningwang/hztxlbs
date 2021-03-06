// 导航目录

$(function(){
	'use strict';

	// 导航插入位置
	var navBar = $('#hz_nav');
	// 函数运行位置
	navBar.html('<li class="" id="li1"> <a href="#" class="dropdown-toggle"> <i class="menu-icon  fa fa-home"></i>' +
		'<span class="menu-text">我的建筑</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +

		'<li class=""><a href="/token"><i class="menu-icon fa fa-caret-right"></i>地图导航</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_history_loc"><i class="menu-icon fa fa-caret-right"></i>历史轨迹</a><b class="arrow"></b></li>' +
		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-caret-right"></i><span class="menu-text">电子围栏</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b> ' +
		'<ul class="submenu">' +
		'<li class=""><a href="/hz_electronic_rail"><i class="menu-icon fa fa-caret-right"></i>实时信息</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_er_alarm"><i class="menu-icon fa fa-caret-right"></i>历史警报</a><b class="arrow"></b></li>' +
		'</ul></li>' +

		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-caret-right"></i><span class="menu-text">人员盘点</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="/hz_ps_zone"><i class="menu-icon fa fa-caret-right"></i>盘点区域</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_ps_result"><i class="menu-icon fa fa-caret-right"></i>盘点结果</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_people_stat_task"><i class="menu-icon fa fa-caret-right"></i>定时盘点</a><b class="arrow"></b></li>' +
		'</ul></li>' +
		'</ul></li>' +

		'<li class=""><a href="/hz_2d_map"><i class="menu-icon fa fa-map-o"></i><span class="menu-text"> 2D地图 </span></a><b class="arrow"></b></li>' +

		'<li class="">' +
			'<a href="/hz_3d_map">' +
				'<i class="menu-icon fa fa-desktop"></i>' +
				'<span class="menu-text"> 3D地图 </span>' +
			'</a>' +
			'<b class="arrow"></b>'
		+'</li>' +

		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-fire"></i><span class="menu-text">智慧消防</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="/#" class="dropdown-toggle"><i class="menu-icon fa fa-caret-right"></i><span class="menu-text">设备管理</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-caret-right"></i><span class="menu-text">RTU 管理</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="/hz_rtu_main"><i class="menu-icon fa fa-caret-right"></i>RTU主页</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_rtu_inter_lock"><i class="menu-icon fa fa-caret-right"></i>关联事件</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_rtu_timed_task"><i class="menu-icon fa fa-caret-right"></i>定时任务</a><b class="arrow"></b></li>' +
		'</ul></li>' +
		'</ul></li>' +
		'</ul></li>' +

		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-tags"></i><span class="menu-text">测试专用页</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="/hz_test_jqgrid"><i class="menu-icon fa fa-caret-right"></i>jqGrid测试页</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/test"><i class="menu-icon fa fa-caret-right"></i>API接口测试</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_ace_blank"><i class="menu-icon fa fa-caret-right"></i>ACE空白页</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_ace_easyui"><i class="menu-icon fa fa-caret-right"></i>ACE与jqEasyUI</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_map"><i class="menu-icon fa fa-caret-right"></i>新版地图</a><b class="arrow"></b></li>' +
		'</ul></li>'
		
	);
	
	var item = navBar.find('[href="'+location.pathname+'"]').parent('li').addClass('active').parent('ul');
	// 增加防止死循环的判断。 当修改js文件。浏览器没有刷新时，点击新页面，chrome 会出现是循环。fire fox 测试则不会。
	while (item[0] && !navBar.is(item)){
		item = item.parent('li').addClass('open').parent('ul');
	}
});
