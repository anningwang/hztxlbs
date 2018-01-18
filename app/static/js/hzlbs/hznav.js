// 导航目录

$(function(){
	// 导航插入位置
	var $nav = $('#hz_nav');
	// 函数运行位置
	var $sign_position;
	$nav.html('<li class="" id="li1"> <a href="#" class="dropdown-toggle"> <i class="menu-icon  fa fa-home"></i>' +
		'<span class="menu-text">我的建筑</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +

		'<li class=""><a href="/token"><i class="menu-icon fa fa-caret-right"></i>地图导航</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_coord_get"><i class="menu-icon fa fa-caret-right"></i>坐标拾取</a><b class="arrow"></b></li>' +
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

		'<li class="">' +
			'<a href="/hz_3d_map">' +
				'<i class="menu-icon fa fa-desktop"></i>' +
				'<span class="menu-text"> 3D地图 </span>' +
			'</a>' +
			'<b class="arrow"></b>'
		+'</li>' +

		'<li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-tags"></i><span class="menu-text">测试专用页</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b>' +
		'<ul class="submenu">' +
		'<li class=""><a href="/hz_test_jqgrid"><i class="menu-icon fa fa-caret-right"></i>jqGrid测试页</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/test"><i class="menu-icon fa fa-caret-right"></i>API接口测试</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_ace_blank"><i class="menu-icon fa fa-caret-right"></i>ACE空白页</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_ace_easyui"><i class="menu-icon fa fa-caret-right"></i>ACE与jqEasyUI</a><b class="arrow"></b></li>' +
		'<li class=""><a href="/hz_map"><i class="menu-icon fa fa-caret-right"></i>新版地图</a><b class="arrow"></b></li>' +
		'</ul></li>'
		
	);

	$sign_position = $nav.find('[href="'+location.pathname+'"]').parent('li').addClass('active').parent('ul');
	while (!$nav.is($sign_position)){
		$sign_position = $sign_position.parent('li').addClass('open').parent('ul');
		console.log($sign_position);
	}
});
