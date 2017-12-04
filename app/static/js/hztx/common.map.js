
			
				
				'use strict';
				var hzX = 0, hzY = 0;   // 坐标系原点
				var margin = 0;        //外边距
				var real_loc_to_pix = 0.0891;      //物理单位转像素单位 比例      比例转换计算公式x为传来的数据   x * real_loc_to_pix * zoom
				var map_w = 3477;       /// px
				var map_h = 1769;
				var zoom = 0.4889;          /// 地图缩放级别
				var hz_is_navigating = false;      /// 是否曾经设置过导航，或正在导航中
				var HZ_DESTINATION_MEETING_ROOM = 27;     //办公室编号
				var hz_destination = HZ_DESTINATION_MEETING_ROOM;            /// 导航的目的地，默认 第一个 目的地
				var hz_time_id = 0;    //废弃
				var hz_user_id = 0;   //下面的索引   实际函数用0应该是未选择
				var HZ_USER_IDS = ['1918E00103AA', '1918E00103A9'];
				var hz_user_xy = [];   //用户数据  每项为一个用户
				
				var storage = window.localStorage;
				
				
				
				
				
				if(storage){
					//storage.clear();
					///alert("浏览支持localStorage");
					var _userId = storage['hz_user_id'];
					if(typeof _userId !== 'undefined') {
						hz_user_id = _userId;
					}
					var hz_zoom = storage['hz_zoom'];
					///alert(hz_zoom);
					if(typeof hz_zoom !== 'undefined') {    /// 存在值
						zoom = hz_zoom;
					}
				
					var _dest = parseInt(storage['hz_destination']);
					isNaN(_dest) ? hz_destination = HZ_DESTINATION_MEETING_ROOM : hz_destination = _dest;
				
					///alert(storage['hz_is_navigating'] + "  " + Boolean(storage['hz_is_navigating']));
					hz_is_navigating = Boolean(storage['hz_is_navigating']);
				}else{
					///alert("浏览暂不支持localStorage");
				}
				
				
				
				
				function transformDemo(svg) {
						var x_meeting_room = 2067;
						var y_meeting_room = 3563;
					
						svg.describe('Example Skew - Show effects of skewX and skewY');
						var str3 = 'translate(' +  parseInt(x_meeting_room*real_loc_to_pix*zoom) + ',' + parseInt(y_meeting_room*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '会议室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
					
						var vice_general_office_x = 2067;
						var vice_general_office_Y = 8981;
						var str3 = 'translate(' +  parseInt(vice_general_office_x*real_loc_to_pix*zoom) + ',' + parseInt(vice_general_office_Y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '副总办公室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
					
						var president_office_x = 2067;
						var president_office_y = 15609;
						var str3 = 'translate(' +  parseInt(president_office_x*real_loc_to_pix*zoom) + ',' + parseInt(president_office_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '总裁室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
					 
						var warehouse1_x = 7947;
						var warehouse1_y = 15609;
						var str3 = 'translate(' +  parseInt(warehouse1_x*real_loc_to_pix*zoom) + ',' + parseInt(warehouse1_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '仓库1',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
					
						var warehouse2_x = 12046;
						var warehouse2_y = 15609;
						var str3 = 'translate(' +  parseInt(warehouse2_x*real_loc_to_pix*zoom) + ',' + parseInt(warehouse2_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '仓库2',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})
					 
						var log_conference_room_x = 31148;
						var log_conference_room_y = 14433;
						var str3 = 'translate(' +  parseInt(log_conference_room_x*real_loc_to_pix*zoom) + ',' + parseInt(log_conference_room_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '大会议室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})
						
						var wisdom_medical_treatment_x = 34569;
						var wisdom_medical_treatment_y = 9587;
						var str3 = 'translate(' +  parseInt(wisdom_medical_treatment_x*real_loc_to_pix*zoom) + ',' + parseInt(wisdom_medical_treatment_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '智慧医疗',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
						var wisdom_park_x = 34309;
						var wisdom_park_y = 6486;
						var str3 = 'translate(' +  parseInt(wisdom_park_x*real_loc_to_pix*zoom) + ',' + parseInt(wisdom_park_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '智慧园区',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
						
						var gym_x = 33678;
						var gym_y = 3101;
						var str3 = 'translate(' +  parseInt(gym_x*real_loc_to_pix*zoom) + ',' + parseInt(gym_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '健身房',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
						
						
						var intelligent_security_x = 31000;
						var intelligent_security_y = 3101;
						var str3 = 'translate(' +  parseInt(intelligent_security_x*real_loc_to_pix*zoom) + ',' + parseInt(intelligent_security_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '智慧安防',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
						
						var intelligent_fire_protection_x = 28403;
						var intelligent_fire_protection_y = 3101;
						var str3 = 'translate(' +  parseInt(intelligent_fire_protection_x*real_loc_to_pix*zoom) + ',' + parseInt(intelligent_fire_protection_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '智慧消防',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
						
						var beidou_xihe_x = 25588;
						var beidou_xihe_y = 3101;
						var str3 = 'translate(' +  parseInt(beidou_xihe_x*real_loc_to_pix*zoom) + ',' + parseInt(beidou_xihe_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '北斗羲和',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
						
						
						var computer_room_x = 19244;
						var computer_room_y = 4775;
						var str3 = 'translate(' +  parseInt(computer_room_x*real_loc_to_pix*zoom) + ',' + parseInt(computer_room_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '机房',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})	
						
						var reception_x = 19244;
						var reception_y = 7456;
						var str3 = 'translate(' +  parseInt(reception_x*real_loc_to_pix*zoom) + ',' + parseInt(reception_y*real_loc_to_pix*zoom) + ')';
						var g1 = svg.group({transform: str3});
						svg.text(g1, 0, 0, '前台',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})	
					
					
					}
				
				
				
				
				
				
				
            	$(function(){
				
				
				
									//以下变量可用可不用
					
					var $svg_map_base = $('#svg_map_base');
					var $svg_event = $('#svg_event');
					var $svg_board = $('#svg_path');
					var $svg_map =  $('#svg_image');
					
					var $document = $(document);

				
				
				
					//地图标识
					var $svg_sign = $('#svg_sign');
					$svg_sign.svg();
					var svg_sign_svg = $svg_sign.svg('get');
					transformDemo(svg_sign_svg);
				
					
					//地图缩放
					
					//地图缩放函数
					
		 
					
					
							  
          	//iii
			//鼠标滚轮缩放svg图
		
				 
				 //localStorage.clear();
				
				 
				$svg_event.ready(
					function(){
						
						
						
						//获取svg图对象
						var mapSign = $svg_map_base;
						//设置缩放速度   比例缩放
						var zoomSpeed = 0.05;
						
		 
						// using the event helper
						$svg_event.on('mousewheel',addMousewheelEvent);
 						function addMousewheelEvent(event, delta, deltaX, deltaY) {
						
						 		//svg图的最小 最大  X和Y
								var mapMinX,mapMaxX,mapMinY,mapMaxY;
								
								var mapOffset = mapSign.offset();
								
								var mapOuterWidth = mapSign.outerWidth();
								var mapOuterHeight = mapSign.outerHeight();
								
								mapMinX = mapOffset.left;
								mapMaxX = mapOffset.left + mapOuterWidth;
								mapMinY = mapOffset.top;
								mapMaxY = mapOffset.top + mapOuterHeight;
								
								
								
								
							
							
							if(event.pageX > mapMinX && event.pageX < mapMaxX && event.pageY > mapMinY && event.pageY <  mapMaxY){

								
								  /*取消默认事件*/
								  event.preventDefault()
								  /*计算速度*/
 						 			
								  
								  var mapHeight, mapWidth, mapTopBorder , mapLeftBorder ,mapTop, mapLeft , speedTop ,speedLeft;
								  /*#map 的基本参数*/
								  mapHeight = mapSign.height();
								  mapWidth = mapSign.width();
								  
								  mapTopBorder = parseInt(mapSign.css('border-top-width'));
								  mapLeftBorder = parseInt(mapSign.css('border-left-width'));
								  
								  mapTop = parseInt(mapSign.css('top'));
								  mapLeft = parseInt(mapSign.css('left'));
								  
								  
								  
								  /*计算缩放速度  单独的top  或  left*/
								  
								  if(delta == 1){
								  	  speedTop =  parseInt(zoomSpeed * mapHeight);
									  console.log ('speedTop',speedTop); 
									  speedLeft =  parseInt(zoomSpeed * mapWidth);
								  }else{
								  	  speedTop =  -parseInt(zoomSpeed * mapHeight);
									  speedLeft = -parseInt(zoomSpeed * mapWidth);
								  }
								  
								 
								/*更改后的高*/
								var resultHeight = mapHeight + (speedTop * 2); 
								var resultWidth = mapWidth + (speedLeft * 2);
								
								
								/*鼠标在图内距离*/
								var currentMouseTop = event.pageY - mapMinY - mapTopBorder;
								var currentMouseLeft = event.pageX - mapMinX - mapLeftBorder;
								/*缩放后再图内的距离*/
								var mouseTop = Math.round(currentMouseTop - (currentMouseTop / mapHeight * resultHeight));
								var mouseLeft = Math.round(currentMouseLeft - (currentMouseLeft / mapWidth * resultWidth));
								 
								 
		
 
 								/*计算svg偏离距离*/
								/*svg图的left*/
 
									
										
								hzY = mapTop + mouseTop  ;
					 			hzX =  mapLeft + mouseLeft ;
									
					 				
								/*保存缩放比例*/
							 	zoom = resultWidth / map_w;
								storage['hz_zoom'] = zoom;
									
									
									
									console.log('margin',margin,'resultHeight',resultHeight,'resultWidth',resultWidth);
									
 									zoomFn(resultHeight,resultWidth);
									
									$svg_map_base.css({
										left:hzX+'px',
										top:hzY + 'px'
									})
									
        						  //hz_map_zoom(margin, margin, resultHeight , resultWidth);
 		  						  //hz_change_item_in_map();
								  
								 /*计算图片相对父元素位置*/
 								  
							}
  							 
						}
					}
				);	
		
			
			
			//缩放函数
			zoomFn(map_h*zoom,map_w*zoom);
			function  zoomFn(height,width){
				var $each_map_layer = $('.each_map_layer');
				$each_map_layer.animate({height:height+'px',width:width+'px'},'fast','swing');
				$each_map_layer.stop(false,true);
				//地图标识;
				svg_sign_svg.clear();
				transformDemo(svg_sign_svg);
				
			}
         
					
					
					
					
					
					
					//地图移动变量
					
					var mapMoveMousedownX,mapMoveMousedownY;
					var currentX,currentY;
					
					
					function addMapMoveEvent(){
						$svg_event.on('mousedown',mapMoveMousedownFn);
					}
					//事件函数
					function mapMoveMousedownFn(e){
						 mapMoveMousedownX = e.pageX;
						 mapMoveMousedownY = e.pageY;
						
					    
						
						$document.on('mousemove',mapMoveMousemoveFn);
						
						$document.on('mouseup',mapMoveMouseupFn);
						
						return false;
						
					}
					function mapMoveMousemoveFn(e){
						var svg_map_base_offset = $svg_map_base.offset();
						
						currentX = e.pageX - mapMoveMousedownX + parseInt(hzX);
						currentY = e.pageY - mapMoveMousedownY + parseInt(hzY);
						
					 
						
						$svg_map_base.css({
							left:currentX+'px',
							top:currentY+'px'
						});
						
					}
					function mapMoveMouseupFn(){
						hzX = currentX;
						hzY = currentY;
						$document.off('mousemove',mapMoveMousemoveFn);
						$document.off('mouseup',mapMoveMouseupFn);
						
					}
					
					function removeMapMoveEvent(){
						$svg_event.off('mousedown',mapMoveMousedownFn);
					}
					
					
					addMapMoveEvent();
					
				})
   