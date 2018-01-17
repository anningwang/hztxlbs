/**
 * Created by WXG on 2018/1/17.
 *
 * Requires: jQuery UI - v1.11.4
 *           jBox v2.3
 */

'use strict';

/**
 * 使用 jQuery UI 的 dialog 组件 实现 提示框。
 * @param content           提示框内容
 * @param title             提示框标题
 * @param icon              提示框标题上的图标
 * @param options           提示框选项。内容同 jQuery UI 的 option
 */
function hzAlert(content, title, icon, options) {
	$('body').append('<div id="hz-dialog-message" class="hide"> <div class="space-6"></div> <p></p><div class="space-6"></div></div>');
	var divDlg = $('#hz-dialog-message');
	divDlg.find('p').text(content).css({'font-weight':'bold'});
	
	title = title || '提示';
	icon = icon || 'ace-icon fa fa-info';
	var width = '320';
	var modal = true;

	if (options) {
		width = options.width || width;
		modal = options.modal !== false;
	}

	var dialog = divDlg.removeClass('hide').dialog({
		resizable: false,
		width: width,
		modal: modal,
		title: "<div class='widget-header widget-header-small'><h4 class='smaller'><i class='" + icon + "'></i>" + title + "</h4></div>",

		title_html: true,
		buttons: [
			{
				text: "确定",
				"class" : "btn btn-primary btn-minier",
				click: function() {
					$( this ).dialog( "close" );
				}
			}
		],
		close: function() {
			$( this ).dialog( "destroy" );
			divDlg.remove();
		}
	});
}


function hzInfo(content, title, icon, options) {
	title = title || '提示';
	$.jBox.info(content, title, icon, options);
}


