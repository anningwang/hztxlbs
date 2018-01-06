 

//localStorage.clear(); // 调试用    清除缓存



    'use strict';
var hzX = 0, hzY = 0;   // 坐标系原点
var margin = 0;        //外边距
var real_loc_to_pix = 0.0891;      //物理单位转像素单位 比例      比例转换计算公式x为传来的数据   x * real_loc_to_pix * zoom
var map_w = 3477;       /// px
var map_h = 1769;
var zoom = 0.486;          /// 地图缩放级别
var hz_is_navigating = false;      /// 是否曾经设置过导航，或正在导航中
var HZ_DESTINATION_MEETING_ROOM = 27;     //办公室编号
var hz_destination = HZ_DESTINATION_MEETING_ROOM;            /// 导航的目的地，默认 第一个 目的地
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


$(document).ready(function(){

    var namespace = '/HeZhong';

    // Connect to the Socket.IO server.
    // The connection URL has the following format:
    //     http[s]://<domain>:<port>[/<namespace>]
    var connStr = location.protocol + '//' + document.domain + ':' + location.port + namespace;
    console.log(connStr);
    var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port + namespace);

    // Event handler for new connections.
    // The callback function is invoked when a connection with the
    // server is established.
    socket.on('connect', function() {
        socket.emit('hz_event', {data: "I'm connected!"});
        if (hz_is_navigating) {
            $('#go').click();
        }
    });

    // Event handler for server sent data.
    // The callback function is invoked whenever the server emits data
    // to the client. The data is then displayed in the "Received"
    // section of the page.
    socket.on('hz_response', function(msg) {
        /// $('#log').append('<br>' + $('<div/>').text('Received #' + msg.count + ': ' + msg.data).html());
    });

    socket.on('hz_position', function(msg) {
	 
      
		
	 
		
        var json = eval(msg); // 数组
		
		
		console.log(json);
		 

		
        $.each(json, function (index, item) {//index json 索引   item  为本索引内容
            hz_user_xy[index] = [item['userId'], json[index]['x'], json[index]['y']];
			//把每个人存起来
        });

        console.log('json len:', json.length, ' hz_user_xy len:', hz_user_xy.length);
        for (var i = 0; i< json.length; i++) {
			
			 
			
			//zoom:地图缩放级别  
			//   hz_people_goto 把人放到对应位置函数 
			
            hz_people_goto(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
                    hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
        }
    });


	

    $("#zoomOut").click(function () {
        zoom = parseFloat(zoom) + 0.05;
        storage['hz_zoom'] = zoom;
        hz_map_zoom(margin, margin, map_h * zoom, map_w * zoom);

        hz_change_item_in_map();
        /*
        for (var i = 0; i< hz_user_xy.length; i++) {
            hz_people_go_no_animate(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
                    hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
        }

        if (hz_is_navigating) {
            hz_clear_path();
            $("#go").click();
        }

        var svg = $('#svg_map').svg('get');
        svg.clear();
        drawInitial(svg);
        */
    });

    $("#zoomIn").click(function () {
        zoom = parseFloat(zoom) - 0.05;
        storage['hz_zoom'] = zoom;
        hz_map_zoom(margin, margin, map_h * zoom, map_w * zoom);

        hz_change_item_in_map();
        /*
        for (var i = 0; i< hz_user_xy.length; i++) {
            hz_people_go_no_animate(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
                    hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
        }

        if (hz_is_navigating) {
            hz_clear_path();
            $("#go").click();
        }

        var svg = $('#svg_map').svg('get');
        svg.clear();
        drawInitial(svg);
        */
    });
/*
    $(".btnGetLocation").click(function(){
        $.post("/get_location", {"userId": "1918E00103AA"}, function(data, status){
            var json = eval(data); // 数组
            $.each(json, function (index, item) {
                hz_user_xy[index] = [item['userId'], json[index]['x'], json[index]['y']];
            });

            for (var i = 0; i< hz_user_xy.length; i++) {
                hz_people_go_no_animate(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
                        hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
            }
        });
    });
*/
    /// 调整地图大小
    hz_map_zoom(margin, margin, map_h * zoom, map_w * zoom);

    if(hz_user_id != 0) {       /// 设置选择用户（标签）图片
        $('#'+ HZ_USER_IDS[hz_user_id-1]).attr('src', '/static/img/peoplesel.png');
    }
    /// 调整用户、标签位置
    ///$('.btnGetLocation').click();


	
	
    $("#loc").val(parseInt(hz_destination));
    $("#userId").val(parseInt(hz_user_id));
    $("#go").attr("disabled", hz_user_id == '0');
    $("#loc").attr("disabled", hz_user_id == '0');
    $('#destination').hide();

});

    function hz_change_item_in_map() {
        for (var i = 0; i< hz_user_xy.length; i++) {
            hz_people_go_no_animate(hz_user_xy[i][1] * real_loc_to_pix * zoom - margin,
                    hz_user_xy[i][2] * real_loc_to_pix * zoom - margin, hz_user_xy[i][0]);
        }

        if (hz_is_navigating) {
            hz_clear_path();
            $("#go").click();
        }

        var svg = $('#svg_map').svg('get');
        svg.clear();
        drawInitial(svg);
    }

function hz_map_zoom(left, top, height, width, isAnimate) {
    isAnimate = isAnimate || true;     // 默认参数为true，执行动画
    $("#map").stop(true, true).animate({
        left:left + hzX,
        top:top + hzY,
        height:height,
        width:width
    });
    if (!isAnimate) {
        $('#map').stop(true, true);
   }
}
//(用户)人位置函数
function hz_people_goto(x, y, people) {
 
	
    people = people || '1918E00103AA';      // 设置默认参数
	
 
	
    /// 24, 45是定位图标的 针尖 位置。显示图片时，是以图片左上角为参考坐标。故需要对坐标进行偏移。
    $("#"+people).stop(true, true).animate({
        left: (hzX + x - 24),
        top: (hzY + y - 45)
    });
}

function hz_people_go_no_animate(x, y, people) {
 
	
    people = people || '1918E00103AA';      // 设置默认参数
 	
	
    /// 24, 45 是定位图标的 针尖 位置。显示图片时，是以图片左上角为参考坐标。故需要对坐标进行偏移。
    $("#"+people).animate({
        left: hzX + x - 24,
        top: hzY + y - 45
    }).stop(true, true);
}



$(function() {
	$('#svg_map').svg({onLoad: drawInitial});
    $('#svg_path').svg({onLoad: drawIniPath()});

    // pan map
    var hzStillDown = false;
    var hzCanvas = $("#floor3");
    var hzOriginalX = 0,  hzOriginalY = 0;
    hzCanvas.mousedown(function(event){
        // console.log('div floor3 was clicked!' + event.pageX + ',' + event.pageY);
        // console.log('offset:(' + event.offsetX + ',' + event.offsetY + ')');
        hzStillDown = true;
        hzOriginalX = event.offsetX;
        hzOriginalY = event.offsetY;
        $(this).css('cursor', 'move');
    });

    ///var hzCoords = [];
    hzCanvas.mousemove(function(e){
        ///if(!hzStillDown) return;
        // console.log("moving");
        ///hzCoords.push({x: e.offsetX, y: e.offsetY});
        // and/or do whatever you need with the coordinates
    });

    hzCanvas.mouseup(function(e){
        if (!hzStillDown) return;
        hzStillDown = false;
        $(this).css('cursor', 'default');
        if (e.offsetX - hzOriginalX == 0 && e.offsetY - hzOriginalY == 0) return;
        hzX += e.offsetX - hzOriginalX;
        hzY += e.offsetY - hzOriginalY;
        $('#map').animate({
            left: hzX,
            top: hzY
        });
        hz_change_item_in_map();
        /*
        var svg = $('#svg_map').svg('get');
        svg.clear();
        drawInitial(svg);
        */
    });
});

function drawIniPath() {
}

function drawInitial(svg) {
  /*  var x_meeting_room = 1420;
    var y_meeting_room = 3000;
    svg.text(parseInt(x_meeting_room*real_loc_to_pix*zoom)+hzX, parseInt(y_meeting_room*real_loc_to_pix*zoom)+hzY, '会议室');*/
    transformDemo(svg);
}

function transformDemo(svg) {
					var x_meeting_room = 2067;
					var y_meeting_room = 3563;
				
					svg.describe('Example Skew - Show effects of skewX and skewY');
					var str3 = 'translate(' +  parseInt(x_meeting_room*real_loc_to_pix*zoom+hzX) + ',' + parseInt(y_meeting_room*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '会议室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
				
					var vice_general_office_x = 2067;
					var vice_general_office_Y = 8981;
					var str3 = 'translate(' +  parseInt(vice_general_office_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(vice_general_office_Y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '副总办公室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
				
					var president_office_x = 2067;
					var president_office_y = 15609;
					var str3 = 'translate(' +  parseInt(president_office_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(president_office_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '总裁室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
				 
					var warehouse1_x = 7947;
					var warehouse1_y = 15609;
					var str3 = 'translate(' +  parseInt(warehouse1_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(warehouse1_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '仓库1',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'});
				
					var warehouse2_x = 12046;
					var warehouse2_y = 15609;
					var str3 = 'translate(' +  parseInt(warehouse2_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(warehouse2_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '仓库2',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})
				 
					var log_conference_room_x = 31148;
					var log_conference_room_y = 14433;
					var str3 = 'translate(' +  parseInt(log_conference_room_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(log_conference_room_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '大会议室',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})
					
					var wisdom_medical_treatment_x = 34569;
					var wisdom_medical_treatment_y = 9587;
					var str3 = 'translate(' +  parseInt(wisdom_medical_treatment_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(wisdom_medical_treatment_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '智慧医疗',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
				
					var wisdom_park_x = 34309;
					var wisdom_park_y = 6486;
					var str3 = 'translate(' +  parseInt(wisdom_park_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(wisdom_park_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '智慧园区',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
					var gym_x = 33678;
					var gym_y = 3101;
					var str3 = 'translate(' +  parseInt(gym_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(gym_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '健身房',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
					
					var intelligent_security_x = 31000;
					var intelligent_security_y = 3101;
					var str3 = 'translate(' +  parseInt(intelligent_security_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(intelligent_security_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '智慧安防',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
					var intelligent_fire_protection_x = 28403;
					var intelligent_fire_protection_y = 3101;
					var str3 = 'translate(' +  parseInt(intelligent_fire_protection_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(intelligent_fire_protection_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '智慧消防',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
					var beidou_xihe_x = 25588;
					var beidou_xihe_y = 3101;
					var str3 = 'translate(' +  parseInt(beidou_xihe_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(beidou_xihe_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '北斗羲和',{fontSize: 16, fontFamily: 'Verdana', fill: 'blue'})
					
					
					var computer_room_x = 19244;
					var computer_room_y = 4775;
					var str3 = 'translate(' +  parseInt(computer_room_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(computer_room_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '机房',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})	
					
					var reception_x = 19244;
					var reception_y = 7456;
					var str3 = 'translate(' +  parseInt(reception_x*real_loc_to_pix*zoom+hzX) + ',' + parseInt(reception_y*real_loc_to_pix*zoom+hzY) + ')';
					var g1 = svg.group({transform: str3});
					svg.text(g1, 0, 0, '前台',{fontSize: 20, fontFamily: 'Verdana', fill: 'blue'})	
}

var colours = ['purple', 'red', 'orange', 'yellow', 'lime', 'green', 'blue', 'navy', 'black'];

function random(range) {
	return Math.floor(Math.random() * range);
}

 /*
function getPos()
{
    if (hz_is_navigating) {
        $("#go").click();
    } else {
        ///$(".btnGetLocation").click();
    }

    for (var p in hz_user_xy) {
        if(hz_user_xy.hasOwnProperty(p)) {
            hz_people_goto(hz_user_xy[p][0] * real_loc_to_pix * zoom - margin,
                    hz_user_xy[p][1] * real_loc_to_pix * zoom - margin, p );
        }
    }
}
*/

/// hz_time_id = window.setInterval("getPos()", 1000);




 