//本脚本为项目导航目录

$(function(){
	//导航插入位置
	var $nav = $('#hz_nav');
	//函数运行位置
	var $sign_position;
	$nav.html('<li class="" id = "li1"><a href="#" class="dropdown-toggle"><i class="menu-icon  fa fa-home"></i><span class="menu-text"> 我的建筑</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b><ul class="submenu"><li class=""><a href="/token"><i class="menu-icon fa fa-caret-right"></i> 地图导航</a><b class="arrow"></b></li><li class=""><a href="/hz_page2"><i class="menu-icon fa fa-caret-right"></i> 坐标拾取</a><b class="arrow"></b></li><li class=""><a href="/hz_history_loc"><i class="menu-icon fa fa-caret-right"></i> 历史轨迹</a><b class="arrow"></b></li><li class=""><a href="#" class="dropdown-toggle"><i class="menu-icon fa fa-caret-right"></i><span class="menu-text"> 电子围栏</span><b class="arrow fa fa-angle-down"></b></a><b class="arrow"></b><ul class="submenu"><li class=""><a href="/hz_electronic_rail"><i class="menu-icon fa fa-caret-right"></i> 实时信息</a><b class="arrow"></b></li><li class=""><a href="/hz_page1"><i class="menu-icon fa fa-caret-right"></i> 历史警报</a><b class="arrow"></b></li></ul></li></ul></li>		');
	
	 $sign_position = $nav.find('[href="'+location.pathname+'"]').parent('li').addClass('active').parent('ul');

	 
	 
	 while (!$nav.is($sign_position)){
		  
	 	 $sign_position = $sign_position.parent('li').addClass('open').parent('ul');
		 console.log($sign_position);
	 }
	
	
})

		