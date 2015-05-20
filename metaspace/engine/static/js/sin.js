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

function sin_render_ionimage(selector, data, coords, pixel_size, colors, max_x, max_y) {
  var img_wid = $(selector).width();
  var psize = pixel_size;
  var svg = d3.select(selector).append("svg").attr("width", img_wid).attr("height", img_wid);
  svg.append("rect")
    .attr("width", 1 + max_x * psize / 20)
    .attr("height", 1 + max_y * psize / 20)
    .style("fill", colors[0]);
  var svg_datapoints = svg.selectAll(".p")
      .data(data["val"])
      .enter();

  var img_color = d3.scale.linear()
    .domain(d3.extent(data["val"]))
    .range( colors );

  svg_datapoints
      .append("rect")
      .attr("width", psize).attr("height", psize)
      .style("fill", function(d) { return img_color(d); } )
      .attr("x",function(d, i) {return coords[ data["sp"][i] ][0] * psize / 20;})
      .attr("y",function(d, i) {return coords[ data["sp"][i] ][1] * psize / 20;});
}


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
  var res = name;
  if (name != null && name.length > 30) {
    res = res.substring(0, 27) + '...';
  }
  return '<a href="/substance/' + id +'">' + res + '</a>';;
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

function sin_render_fullextract_disabled(data) {
  return "<a class=\"btn btn-danger btn-sm disabled btn-fullextract\" datasetid=\"" + data + "\" rel=\"group\" data-toggle=\"modal\" data-target=\"#myModal\">Run full extraction</a>";
}

function sin_render_adduct(d) {
  if (d == 0) {
    return 'H';
  } else if (d == 1) {
    return 'Na';
  } else if (d == 2) {
    return 'K';
  }
  return '???';
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

function sin_amchart_spectrum(selector, data, guides, pathtoimages) {
  return AmCharts.makeChart(selector, {
    "type": "serial",
    "theme": "none",
    "dataProvider": data,
    "pathToImages": pathtoimages,
    "categoryField": "mz",
    "legend": {
      "useGraphSettings": true,
      "position" : "right"
    },
    "categoryAxis": {
        "dashLength": 1,
        // "minorGridEnabled": true,
        "labelsEnabled": false,
        "position": "bottom",
        // "minimum": d3.min( data, function(d) { return d["mz"]; } ) - 5.25,
        // "maximum": d3.max( data, function(d) { return d["mz"]; } ) + 0.25,
        "guides" : guides
    },
    "graphs": [
      {
        "id"              : "int",
        "title"            : "Theoretical",
        "valueAxis"       : "axisval",
        "valueField"      : "int",
        "colorField"      : "lineColor",
        "lineColorField"  : "lineColor",
        "lineAlpha"       : 1,
        "lineColor"       : linecolors[2],
        "alphaField"      : "alpha",
        "lineThickness"   : 1.5
      }
    ],
    "chartScrollbar" : {
    },
    "chartCursor": {
        "cursorPosition": "mouse",
        "zoomable": true,
         "valueLineEnabled":true,
         "valueLineBalloonEnabled":true
    },
    "valueAxes": [{
        "id": "axisval",
        "reversed": false,
        "axisAlpha": 1,
        "axisThickness": 2,
        "dashLength": 5,
        "gridCount": 10,
        "maximum": 100,
        "axisColor": "black",
        "position": "left",
        "title": "Intensity (a.u.)"
    }],
  });
}

function sin_amchart_spectrum_withsample(selector, data, guides, pathtoimages) {
  var chart = sin_amchart_spectrum(selector, data, guides, pathtoimages);
  // console.log(chart.categoryAxis.minimum);
  var graph = new AmCharts.AmGraph();
  graph.valueField = "sample";
  graph.title = "Sample";
  graph.type = "column";
  graph.lineColor = "red";
  graph.fillColor = "red";
  graph.fillAlpha = 0.8;
  graph.lineThickness = 1.5;
  graph.bulletField = "bullet";
  graph.bulletSize = 5;
  chart.addGraph(graph);
  return chart;
}