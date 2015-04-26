var linecolors = [
        "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#808080", 
        "#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#000000", 
        "#C00000", "#00C000", "#0000C0", "#C0C000", "#C000C0", "#00C0C0", "#C0C0C0",  
        "#400000", "#004000", "#000040", "#404000", "#400040", "#004040", "#404040", 
        "#200000", "#002000", "#000020", "#202000", "#200020", "#002020", "#202020", 
        "#600000", "#006000", "#000060", "#606000", "#600060", "#006060", "#606060", 
        "#A00000", "#00A000", "#0000A0", "#A0A000", "#A000A0", "#00A0A0", "#A0A0A0", 
        "#E00000", "#00E000", "#0000E0", "#E0E000", "#E000E0", "#00E0E0", "#E0E0E0",
];


var m_names_rod = new Array(" января ", " февраля ", " марта ", " апреля ", " мая ", " июня ", " июля ", " августа ", " сентября ", " октября ", " ноября ", " декабря ");
var m_names_im = new Array("Январь ", "Февраль ", "Март ", "Апрель ", "Май ", "Июнь ", "Июль ", "Август ", "Сентябрь ", "Октябрь ", "Ноябрь ", "Декабрь ");


function sin_render_dataset(id, name) {
  return name;
  // return '<a href="/dataset/' + id +'">' + name + '</a>';
}

function sin_render_job(id, type, name) {
  if (type == 1) {
    return '<a href="/fullresults/' + id +'">' + name + '</a>';
  }
  return name;
  // return '<a href="/dataset/' + id +'">' + name + '</a>';
}

function sin_render_substance_small(id, name) {
  var res = '<a href="/substance/' + id +'">' + name + '</a>';
  if (name != null && name.length > 40) {
    return res.substring(0, 37) + '...';
  }
  return res;
}

function sin_render_substance(id, name) {
  return '<a href="/substance/' + id +'">' + name + '</a>';
}

function sin_render_fullresults(id) {
  return '<a href="/fullresults/' + id +'">' + "Show results" + '</a>';
}

function sin_render_tasks(done, total) {
  var style="warning";
  if (total == done && total > 0) {
    style="success";
  }
  return '<div class="progress" style="text-align:center;font-weight:bold;height:80%;"><div class="progress-bar-' + style + '" role="progressbar" aria-valuenow="' + (done * 100 / total).toString() + '" aria-valuemin="0" aria-valuemax="100" style="width: ' + (done * 100 / total).toString() + '%;">' + done + "/" + total + '</div></div>';
  // if (total == done) {
  //   return total;
  // } else {
  //   return done + "/" + total;
  // }
}

function sin_render_time(data) {
  return data.slice(0, 19).replace('T', ' ');
}

function sin_render_jobresult(data) {
  // return "<a class=\"btn btn-success btn-sm fancybox-ajax\" rel=\"group\" href=\"/mzimage/" + data + ".png\">Show m/z image</a>" +
  return '<button type="button" class="btn btn-success btn-sm btn-mz" data-toggle="modal" data-target="#mzmodal" id="' + data + '">Show m/z images</button>';
}

function show_images_callback() {
  var id = $(this).attr("id");
  $.getJSON("/ajax/jobstats/" + id + "/", function (data) {
    var mzbody = '<div class="container-fluid" style="padding-right: 50px;"><div class="row">';
    var ent = data["stats"]["entropies"];
    $('#span-corriso').text(data["stats"]["corr_images"].toFixed(4));
    $('#span-corrint').text(data["stats"]["corr_int"].toFixed(4));
    var peaks = data["peaks"];
    var npeaks = peaks.length;
    var img_wid = 1000 / npeaks;
    var div_col = Math.round(12 / npeaks);
    if (div_col == 0) {
      div_col = 1;
    }
    for (var i=0; i<npeaks; i+=1) {
      mzbody += '<div class="col-md-' + div_col.toString() + ' mzimg-cell">m/z = ' + peaks[i].toFixed(2) + '</div>';
    }
    mzbody += '</div><div class="row">';
    for (var i=0; i<npeaks; i+=1) {
      mzbody += '<div class="col-md-' + div_col.toString() + '"><img width="' + img_wid.toString() +
          '" src="/mzimage/' + id + 'p' + i + '.png"/></div>';
    }
    mzbody += '</div><div class="row">';
    for (var i=0; i<npeaks; i+=1) {
      mzbody += '<div class="col-md-' + div_col.toString() + ' mzimg-cell">Entropy = ' + ent[i].toFixed(3) + '</div>';
    }
    mzbody += '</div></div>';
    $("#mz-body").html(mzbody);
  });
}

function sin_render_fullextract(data) {
  return "<a class=\"btn btn-danger btn-sm btn-fullextract\" datasetid=\"" + data + "\" rel=\"group\" data-toggle=\"modal\" data-target=\"#myModal\">Run full extraction</a>";
}

function sin_format_daterange(dts1, dts2) {
  var d1 = new Date(dts1);
  var d2 = new Date(dts2);
  if (d1.getFullYear() == d2.getFullYear()) {
    if (d1.getMonth() == d2.getMonth()) {
      if (d1.getDate() == d2.getDate()) {
        return d1.getDate() + m_names_rod[d1.getMonth()] + d1.getFullYear();
      } else {
        return d1.getDate() + '&ndash;' + d2.getDate() + m_names_rod[d1.getMonth()] + d1.getFullYear();
      }
    } else {
      return d1.getDate() + m_names_rod[d1.getMonth()] + ' &ndash; ' + d2.getDate() + m_names_rod[d2.getMonth()] + d1.getFullYear();
    }
  }
  return d1.getDate() + m_names_rod[d1.getMonth()] + d1.getFullYear() + ' &ndash; ' + d2.getDate() + m_names_rod[d2.getMonth()] + d2.getFullYear();
}

function sin_format_date(dtstring) {
	var d = new Date(dtstring);
	return d.getDate() + m_names_rod[d.getMonth()] + d.getFullYear();
}

function sin_format_mon(dtstring) {
	var d = new Date(dtstring);
	return m_names_im[d.getMonth()] + d.getFullYear();
}

function sin_format_nodash(dtstring) {
  return dtstring.substring(0,4) + dtstring.substring(5,7) + dtstring.substring(8,10);
}

function sin_render_team(id, name) {
  // if (id == null) return '&ndash;';
  if (id == null) return '';
  if (id == 0) return 'Без команды';
  return '<a href="/team/' + id +'">' + name + '</a>';
}

function sin_render_place(minpl, maxpl) {
  // if (minpl == null) return '&ndash;';
  if (minpl == null) return '';
  if (minpl != maxpl) {
    return minpl + '&ndash;' + maxpl;
  }
  return minpl;
}

function sin_render_result(correct, total) {
  // if (correct == null) return '&ndash;';
  if (correct == null) return '';
  return correct + ' / ' + total;
}

function sin_render_tourn(id, name) {
  return '<a href="/tourn/' + id +'">' + name + '</a>';
}

function sin_render_rating(data) {
  if (data == null) {
    return "";
  } else {
    return data.toFixed(3);
  }
}

function sin_render_rating_short(data) {
  if (data == null) {
    return "";
  } else {
    return data.toFixed(1);
  }
}

function sin_render_avatar(player_id, size, alttext) {
  return '<img width="' + size + '" height="' + size + '" src="/img/p/' + player_id + '.jpg" alt="' + alttext + '"/>';
}

function sin_render_roster_photos(data, picsize, shownames, reverse) {
  if(typeof(reverse)==='undefined') reverse = false;
  var roster = '<table><tr>';
  for (var i=0; i < data.length; ++i) {
    var j = reverse ? data.length - i - 1 : i;
    roster += '<td width="100pt"><a href="/player/' + data[j][0] + '" rel="tooltip" data-toggle="tooltip" title="' + data[j][2] + ' ' + data[j][1] + '">' + sin_render_avatar(data[j][0], picsize, data[j][2] + ' ' + data[j][1]) + '</a></td>';
  }
  if (shownames > 0) {
    roster += '</tr><tr>';
    for (var i=0; i < data.length; ++i) {
      var j = reverse ? data.length - i - 1 : i;
      roster += '<td class="td-small"><a href="/player/' + data[j][0] + '">' + data[j][2] + '<br/>' + data[j][1] + '</a></td>';
    }
  }
  return roster + '</tr></table>';
}

function sin_render_roster(rowid, arr_id, arr_last, arr_first, arr_rating) {
  if (arr_id == null || arr_id.length == 0) {
    return '';
  }
  arr = []
  for(var i = 0; i < arr_id.length; i++) {
    arr.push('<b>' + sin_render_rating_short(arr_rating[i]) + '</b> <a href="/player/' + arr_id[i] + '">' + arr_last[i] + ' ' + arr_first[i] + '</a>')
  }
  return '<a class="btn btn-xs btn-link" data-toggle="collapse" href="#tr' + rowid + '" aria-controls="tr' + rowid + '">Показать/скрыть состав</a><div class="collapse" id="tr' + rowid + '">' + arr.join("<br/>") + '</div>';
}

function sin_render_question(row_id, question, answer, pass, comment, author, source) {
  var res = '<a class="btn btn-xs btn-link" data-toggle="collapse" href="#tr' + row_id + '" aria-controls="tr' + row_id + '">Показать/скрыть вопрос</a>';
  res += '<a class="btn btn-xs btn-link" data-toggle="collapse" data-target="#tr' + row_id + ',#tra' + row_id + '" aria-controls="tr' + row_id + '">с ответом</a>';
  res += '<div class="collapse" id="tr' + row_id + '">';
  res += '<div class="well well-sm"><p><b>Вопрос</b>.<br/>' + question.replace(/(?:\r\n|\r|\n)/g, '<br />') + '</p>';
  res += '<a class="btn btn-xs btn-link" data-toggle="collapse" href="#tra' + row_id + '" aria-controls="tra' + row_id + '">Показать/скрыть ответ</i></a><div class="collapse" id="tra' + row_id + '">'
  res += '<p><b>Ответ</b>. ' + answer + '</p>';
  if (pass != null) {
    res += '<p><b>Зачёт</b>. ' + pass + '</p>';
  }
  if (comment != null) {
    res += '<p><b>Комментарий</b>.<br/>' + comment.replace(/(?:\r\n|\r|\n)/g, '<br />') + '</p>';
  }
  if (source != null) {
    res += '<b>Источник</b>. ' + source.replace(/(?:\r\n|\r|\n)/g, '<br />') + '<p>';
  }
  if (author != null) {
    res += '<b>Автор</b>. ' + author + '<br/></p></div></div>';
  }
  return res;
}

function sin_render_resbytour(num_tour_cols, data) {
  res = '<div class="row-fluid">';
  for (var i=0; i<data.length; i++) {
    res += '<div class="col-xs-' + num_tour_cols + '">' + data[i] + '</div>';
  }
  return res + '</div>';
}

function sin_tourq_columns(number) {
    res = [
      {"data" : "0"}, {"data" : "1"}, {"data" : "2"}
    ];
    for (var i=0; i<number; i++) {
      res.push({"data" : "3." + i});
    }
    res.push({"data" : "4"});
    res.push({"data" : "5"});
    res.push({"data" : "6"});
    alert(number);
    alert(res);
    return res;
}

function pad(number, length) {
    var str = '' + number;
    var diff = length - str.length;
    for (var i=0; i<diff; ++i) {
        str = '&nbsp;' + str;
    }
    return str;
}

function pad_space(number, length) {
    var str = '' + number;
    while (str.length < length) {
        str = ' ' + str;
    }
    return str;
}

var myTableLanguagePlayers = {
            "sSearch": "Введите id или начало фамилии:",
            "sLengthMenu": "Показывать по _MENU_ записей",
            "sZeroRecords": "Записей не найдено",
            "sInfoEmpty": "Что-то пошло не так: в таблице нет записей...",
            "sInfo": "Всего _TOTAL_ записей (от _START_ до _END_)",
            "oPaginate": {
              "sFirst":     "Первая",
              "sNext":      "След.",
              "sPrevious":  "Пред.",
              "sLast":      "Последняя"
            }
};

var myTableLanguageTeams = {
            "sSearch": "Введите id или начало названия:",
            "sLengthMenu": "Показывать по _MENU_ записей",
            "sZeroRecords": "Записей не найдено",
            "sInfoEmpty": "Что-то пошло не так: в таблице нет записей...",
            "sInfo": "Всего _TOTAL_ записей (от _START_ до _END_)",
            "oPaginate": {
              "sFirst":     "Первая",
              "sNext":      "След.",
              "sPrevious":  "Пред.",
              "sLast":      "Последняя"
            }
};

var myTableLanguageTourns = {
            "sSearch": "Введите id или часть названия:",
            "sLengthMenu": "Показывать по _MENU_ записей",
            "sZeroRecords": "Записей не найдено",
            "sInfoEmpty": "Что-то пошло не так: в таблице нет записей...",
            "sInfo": "Всего _TOTAL_ записей (от _START_ до _END_)",
            "oPaginate": {
              "sFirst":     "Первый",
              "sNext":      "След.",
              "sPrevious":  "Пред.",
              "sLast":      "Последний"
            }
};

