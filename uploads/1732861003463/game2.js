'use strict';
/*
* 小型游戏引擎
*/

// requestAnimationFrame polyfill
if (!Date.now)
Date.now = function() { return new Date().getTime(); };
(function() {
    'use strict';
    var vendors = ['webkit', 'moz'];
    for (var i = 0; i < vendors.length && !window.requestAnimationFrame; ++i) {
        var vp = vendors[i];
        window.requestAnimationFrame = window[vp+'RequestAnimationFrame'];
        window.cancelAnimationFrame = (window[vp+'CancelAnimationFrame'] || window[vp+'CancelRequestAnimationFrame']);
    }
    if (/iP(ad|hone|od).*OS 6/.test(window.navigator.userAgent) // iOS6 is buggy
    || !window.requestAnimationFrame || !window.cancelAnimationFrame) {
        var lastTime = 0;
        window.requestAnimationFrame = function(callback) {
            var now = Date.now();
            var nextTime = Math.max(lastTime + 16, now);
            return setTimeout(function() { callback(lastTime = nextTime); },
            nextTime - now);
        };
        window.cancelAnimationFrame = clearTimeout;
    }
}());

function Game(id,params){
    var _ = this;
    var settings = {
        width:960,						//画布宽度
        height:640						//画布高度
    };
    var _extend = function(target,settings,params){
        params = params||{};
        for(var i in settings){
            target[i] = params[i]||settings[i];
        }
        return target;
    };
    _extend(_,settings,params);
    var $canvas = document.getElementById(id);
    $canvas.width = _.width;
    $canvas.height = _.height;
    var _context = $canvas.getContext('2d');	//画布上下文环境
    var _stages = [];							//布景对象队列
    var _events = {};							//事件集合
    var _index=0,								//当前布景索引
        _hander;  								//帧动画控制
    //活动对象构造
    var Item = function(params){
        this._params = params||{};
        this._id = 0;               //标志符
        this._stage = null;         //与所属布景绑定
        this._settings = {
            x:0,					//位置坐标:横坐标
            y:0,					//位置坐标:纵坐标
            width:20,				//宽
            height:20,				//高
            type:0,					//对象类型,0表示普通对象(不与地图绑定),1表示玩家控制对象,2表示程序控制对象
            color:'#F00',			//标识颜色
            status:1,				//对象状态,0表示未激活/结束,1表示正常,2表示暂停,3表示临时,4表示异常
            orientation:0,			//当前定位方向,0表示右,1表示下,2表示左,3表示上
            speed:0,				//移动速度
            //地图相关
            location:null,			//定位地图,Map对象
            coord:null,				//如果对象与地图绑定,需设置地图坐标;若不绑定,则设置位置坐标
            path:[],				//NPC自动行走的路径
            vector:null,			//目标坐标
            //布局相关
            frames:1,				//速度等级,内部计算器times多少帧变化一次
            times:0,				//刷新画布计数(用于循环动画状态判断)
            timeout:0,				//倒计时(用于过程动画状态判断)
            control:{},				//控制缓存,到达定位点时处理
            update:function(){}, 	//更新参数信息
            draw:function(){}		//绘制
        };
        _extend(this,this._settings,this._params);
    };
    Item.prototype.bind = function(eventType,callback){
        if(!_events[eventType]){
            _events[eventType] = {};
            $canvas.addEventListener(eventType,function(e){
                var position = _.getPosition(e);
                _stages[_index].items.forEach(function(item){
                    if(Math.abs(position.x-item.x)<item.width/2&&Math.abs(position.y-item.y)<item.height/2){
                        var key = 's'+_index+'i'+item._id;
                        if(_events[eventType][key]){
                            _events[eventType][key](e);
                        }
                    }
                });
                e.preventDefault();
            });
        }
        _events[eventType]['s'+this._stage.index+'i'+this._id] = callback.bind(this);  //绑定作用域
    };
    //地图对象构造器
    var Map = function(params){
        this._params = params||{};
        this._id = 0;               //标志符
        this._stage = null;         //与所属布景绑定
        this._settings = {
            x:0,					//地图起点坐标
            y:0,
            size:20,				//地图单元的宽度
            data:[],				//地图数据
            x_length:0,				//二维数组x轴长度
            y_length:0,				//二维数组y轴长度
            frames:1,				//速度等级,内部计算器times多少帧变化一次
            times:0,				//刷新画布计数(用于循环动画状态判断)
            cache:false,    		//是否静态（如静态则设置缓存）
            update:function(){},	//更新地图数据
            draw:function(){},		//绘制地图
        };
        _extend(this,this._settings,this._params);
    };
    //获取地图上某点的值
    Map.prototype.get = function(x,y){
        if(this.data[y]&&typeof this.data[y][x]!='undefined'){
            return this.data[y][x];
        }
        return -1;
    };
    //设置地图上某点的值
    Map.prototype.set = function(x,y,value){
        if(this.data[y]){
            this.data[y][x] = value;
        }
    };
    //地图坐标转画布坐标
    Map.prototype.coord2position = function(cx,cy){
        return {
            x:this.x+cx*this.size+this.size/2,
            y:this.y+cy*this.size+this.size/2
        };
    };
    //画布坐标转地图坐标
    Map.prototype.position2coord = function(x,y){
        var fx = Math.abs(x-this.x)%this.size-this.size/2;
        var fy = Math.abs(y-this.y)%this.size-this.size/2;
        return {
            x:Math.floor((x-this.x)/this.size),
            y:Math.floor((y-this.y)/this.size),
            offset:Math.sqrt(fx*fx+fy*fy)
        };
    };
    //寻址算法
    Map.prototype.finder = function(params){
        var defaults = {
            map:null,
            start:{},
            end:{},
            type:'path'
        };
        var options = _extend({},defaults,params);
        if(options.map[options.start.y][options.start.x]||options.map[options.end.y][options.end.x]){ //当起点或终点设置在墙上
            return [];
        }
        var finded = false;
        var result = [];
        var y_length  = options.map.length;
        var x_length = options.map[0].length;
        var steps = [];     //步骤的映射
        for(var y=y_length;y--;){
            steps[y] = new Array(x_length).fill(0);
        }
        var _getValue = function(x,y){  //获取地图上的值
            if(options.map[y]&&typeof options.map[y][x]!='undefined'){
                return options.map[y][x];
            }
            return -1;
        };
        var _next = function(to){ //判定是否可走,可走放入列表
            var value = _getValue(to.x,to.y);
            if(value<1){
                if(value==-1){
                    to.x = (to.x+x_length)%x_length;
                    to.y = (to.y+y_length)%y_length;
                    to.change = 1;
                }
                if(!steps[to.y][to.x]){
                    result.push(to);
                }
            }
        };
        var _render = function(list){//找线路
            var new_list = [];
            var next = function(from,to){
                var value = _getValue(to.x,to.y);
                if(value<1){	//当前点是否可以走
                    if(value==-1){
                        to.x = (to.x+x_length)%x_length;
                        to.y = (to.y+y_length)%y_length;
                        to.change = 1;
                    }
                    if(to.x==options.end.x&&to.y==options.end.y){
                        steps[to.y][to.x] = from;
                        finded = true;
                    }else if(!steps[to.y][to.x]){
                        steps[to.y][to.x] = from;
                        new_list.push(to);
                    }
                }
            };
            list.forEach(function(current){
				next(current,{y:current.y+1,x:current.x});
                next(current,{y:current.y,x:current.x+1});
                next(current,{y:current.y-1,x:current.x});
                next(current,{y:current.y,x:current.x-1});
            });
            if(!finded&&new_list.length){
                _render(new_list);
            }
        };
        _render([options.start]);
        if(finded){
            var current=options.end;
            if(options.type=='path'){
                while(current.x!=options.start.x||current.y!=options.start.y){
                    result.unshift(current);
                    current=steps[current.y][current.x];
                }
            }else if(options.type=='next'){
                _next({x:current.x+1,y:current.y});
                _next({x:current.x,y:current.y+1});
                _next({x:current.x-1,y:current.y});
                _next({x:current.x,y:current.y-1});
            }
        }
        return result;
    };
    //布景对象构造器
    var Stage = function(params){
        this._params = params||{};
        this._settings = {
            index:0,                        //布景索引
            status:0,						//布景状态,0表示未激活/结束,1表示正常,2表示暂停,3表示临时,4表示异常
            maps:[],						//地图队列
            audio:[],						//音频资源
            images:[],						//图片资源
            items:[],						//对象队列
            timeout:0,						//倒计时(用于过程动画状态判断)
            update:function(){}				//嗅探,处理布局下不同对象的相对关系
        };
        _extend(this,this._settings,this._params);
    };
    //添加对象
    Stage.prototype.createItem = function(options){
        var item = new Item(options);
        //动态属性
        if(item.location){
            var position = item.location.coord2position(item.coord.x,item.coord.y);
            item.x = position.x;
            item.y = position.y;
        }
        //关系绑定
        item._stage = this;
        item._id = this.items.length;
        this.items.push(item);
        return item;
    };
    //重置物体位置
    Stage.prototype.resetItems = function(){
        this.status = 1;
        this.items.forEach(function(item,index){
            _extend(item,item._settings,item._params);
            if(item.location){
                var position = item.location.coord2position(item.coord.x,item.coord.y);
                item.x = position.x;
                item.y = position.y;
            }
        });
    };
    //获取对象列表
    Stage.prototype.getItemsByType = function(type){
        return this.items.filter(function(item){
            if(item.type==type){
                return item;
            }
        });
    };
    //添加地图
    Stage.prototype.createMap = function(options){
        var map = new Map(options);
        //动态属性
        map.data = JSON.parse(JSON.stringify(map._params.data));
        map.y_length = map.data.length;
        map.x_length = map.data[0].length;
        map.imageData = null;
        //关系绑定
        map._stage = this;
        map._id = this.maps.length;
        this.maps.push(map);
        return map;
    };
    //重置地图
    Stage.prototype.resetMaps = function(){
        this.status = 1;
        this.maps.forEach(function(map){
            _extend(map,map._settings,map._params);
            map.data = JSON.parse(JSON.stringify(map._params.data));
            map.y_length = map.data.length;
            map.x_length = map.data[0].length;
            map.imageData = null;
        });
    };
    //重置
    Stage.prototype.reset = function(){
        _extend(this,this._settings,this._params);
        this.resetItems();
        this.resetMaps();
    };
    //绑定事件
    Stage.prototype.bind = function(eventType,callback){
        if(!_events[eventType]){
            _events[eventType] = {};
            window.addEventListener(eventType,function(e){
                var key = 's' + _index;
                if(_events[eventType][key]){
                    _events[eventType][key](e);
                }
                e.preventDefault();
            });
        }
        _events[eventType]['s'+this.index] = callback.bind(this);	//绑定事件作用域
    };
    //动画开始
    this.start = function() {
        var f = 0;		//帧数计算
        var fn = function(){
            var stage = _stages[_index];
            _context.clearRect(0,0,_.width,_.height);		//清除画布
            _context.fillStyle = '#000000';
            _context.fillRect(0,0,_.width,_.height);
            f++;
            if(stage.timeout){
                stage.timeout--;
            }
            if(stage.update()!=false){		            //update返回false,则不绘制
                stage.maps.forEach(function(map){
                    if(!(f%map.frames)){
                        map.times = f/map.frames;		//计数器
                    }
                    if(map.cache){
                        if(!map.imageData){
                            _context.save();
                            map.draw(_context);
                            map.imageData = _context.getImageData(0,0,_.width,_.height);
                            _context.restore();
                        }else{
                            _context.putImageData(map.imageData,0,0);
                        }
                    }else{
                    	map.update();
                        map.draw(_context);
                    }
                });
                stage.items.forEach(function(item){
                    if(!(f%item.frames)){
                        item.times = f/item.frames;		   //计数器
                    }
                    if(stage.status==1&&item.status!=2){  	//对象及布景状态都不处于暂停状态
                        if(item.location){
                            item.coord = item.location.position2coord(item.x,item.y);
                        }
                        if(item.timeout){
                            item.timeout--;
                        }
                        item.update();
                    }
                    item.draw(_context);
                });
            }
            _hander = requestAnimationFrame(fn);
        };
        _hander = requestAnimationFrame(fn);
    };
    //动画结束
    this.stop = function(){
        _hander&&cancelAnimationFrame(_hander);
    };
    //事件坐标
    this.getPosition = function(e){
        var box = $canvas.getBoundingClientRect();
        return {
            x:e.clientX-box.left*(_.width/box.width),
            y:e.clientY-box.top*(_.height/box.height)
        };
    }
    //创建布景
    this.createStage = function(options){
        var stage = new Stage(options);
        stage.index = _stages.length;
        _stages.push(stage);
        return stage;
    };
    //指定布景
    this.setStage = function(index){
        _stages[_index].status = 0;
        _index = index;
        _stages[_index].status = 1;
        return _stages[_index];
    };
    //下个布景
    this.nextStage = function(){
        if(_index<_stages.length-1){
            return this.setStage(++_index);
        }else{
            throw new Error('unfound new stage.');
        }
    };
    //初始化游戏引擎
    this.init = function(){
        _index = 0;
        this.start();
    };
}
//主程序,业务逻辑
(function(){
	var _DATA = [		//使用北航校园地图生成的二维数组，0表示路径，1表示墙壁，2表示特殊区域
		// 此处省略实际地图数据，请根据北航校园地图替换
	],
	_GOODS = {			//能量豆
		'1,3':1,
		'26,3':1,
		'1,23':1,
		'26,23':1
	},
	_SPECIAL_GOODS = {   // 特殊道具位置
		'5,5': 'rocket',
		'20,15': 'satellite'
	},
	_COS = [1,0,-1,0],
	_SIN = [0,1,0,-1],
	_COLOR = ['#F00','#F93','#0CF','#F9C'],//红,橙,蓝,粉
	_LIFE = 3,
	_SCORE = 0;		//得分

	var game = new Game('canvas');
	//启动页
	(function(){
		var stage = game.createStage();
		//logo
		stage.createItem({
			x:game.width/2,
			y:game.height*.45,
			width:100,
			height:100,
			frames:3,
			draw:function(context){
				var t = Math.abs(5-this.times%10);
				context.fillStyle = '#FFE600';
				context.beginPath();
				context.arc(this.x,this.y,this.width/2,t*.04*Math.PI,(2-t*.04)*Math.PI,false);
				context.lineTo(this.x,this.y);
				context.closePath();
				context.fill();
				context.fillStyle = '#000';
				context.beginPath();
				context.arc(this.x+5,this.y-27,7,0,2*Math.PI,false);
				context.closePath();
				context.fill();
			}
		});
		//游戏名
		stage.createItem({
			x:game.width/2,
			y:game.height*.6,
			draw:function(context){
				context.font = 'bold 42px Helvetica';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillStyle = '#FFF';
				context.fillText('吃豆人 - 北航版',this.x,this.y);
			}
		});
		//版权信息
		stage.createItem({
			x:game.width-12,
			y:game.height-5,
			draw:function(context){
				context.font = '14px Helvetica';
				context.textAlign = 'right';
				context.textBaseline = 'bottom';
				context.fillStyle = '#AAA';
				context.fillText('© BUAA 游戏网',this.x,this.y);
			}
		});
		//事件绑定
		stage.bind('keydown',function(e){
			switch(e.keyCode){
				case 13:
				case 32:
				game.nextStage();
				break;
			}
		});
	})();
	//游戏主程序
	(function(){
		var stage,map,beans,player,times,items;
		stage = game.createStage({
			update:function(){
				var stage = this;
				if(stage.status==1){								//场景正常运行
					items.forEach(function(item){
						if(map&&!map.get(item.coord.x,item.coord.y)&&!map.get(player.coord.x,player.coord.y)){
							var dx = item.x-player.x;
							var dy = item.y-player.y;
							if(dx*dx+dy*dy<750&&item.status!=4){		//物体检测
								if(item.status==3){
									item.status = 4;
									_SCORE += 10;
								}else{
									if (!player.invincible) {
										stage.status = 3;
										stage.timeout = 30;
									}
								}
							}
						}
					});
					if(JSON.stringify(beans.data).indexOf(0)<0){	//当没有物品的时候，进入结束画面
						game.nextStage();
					}
				}else if(stage.status==3){		//场景临时状态
					if(!stage.timeout){
						_LIFE--;
						if(_LIFE){
							stage.resetItems();
						}else{
							game.nextStage();
							return false;
						}
					}
				}
			}
		});
		//绘制地图
		map = stage.createMap({
			x:60,
			y:10,
			data:_DATA,
			cache:true,
			draw:function(context){
				context.lineWidth = 2;
				for(var j=0; j<this.y_length; j++){
					for(var i=0; i<this.x_length; i++){
						var value = this.get(i,j);
						if(value){
							var code = [0,0,0,0];
							if(this.get(i+1,j)&&!(this.get(i+1,j-1)&&this.get(i+1,j+1)&&this.get(i,j-1)&&this.get(i,j+1))){
								code[0]=1;
							}
							if(this.get(i,j+1)&&!(this.get(i-1,j+1)&&this.get(i+1,j+1)&&this.get(i-1,j)&&this.get(i+1,j))){
								code[1]=1;
							}
							if(this.get(i-1,j)&&!(this.get(i-1,j-1)&&this.get(i-1,j+1)&&this.get(i,j-1)&&this.get(i,j+1))){
								code[2]=1;
							}
							if(this.get(i,j-1)&&!(this.get(i-1,j-1)&&this.get(i+1,j-1)&&this.get(i-1,j)&&this.get(i+1,j))){
								code[3]=1;
							}
							if(code.indexOf(1)>-1){
								context.strokeStyle=value==2?"#FFF":"#09C";
								var pos = this.coord2position(i,j);
								switch(code.join('')){
									case '1100':
										context.beginPath();
										context.arc(pos.x+this.size/2,pos.y+this.size/2,this.size/2,Math.PI,1.5*Math.PI,false);
										context.stroke();
										context.closePath();
										break;
									case '0110':
										context.beginPath();
										context.arc(pos.x-this.size/2,pos.y+this.size/2,this.size/2,1.5*Math.PI,2*Math.PI,false);
										context.stroke();
										context.closePath();
										break;
									case '0011':
										context.beginPath();
										context.arc(pos.x-this.size/2,pos.y-this.size/2,this.size/2,0,.5*Math.PI,false);
										context.stroke();
										context.closePath();
										break;
									case '1001':
										context.beginPath();
										context.arc(pos.x+this.size/2,pos.y-this.size/2,this.size/2,.5*Math.PI,1*Math.PI,false);
										context.stroke();
										context.closePath();
										break;
									default:
										var dist = this.size/2;
										code.forEach(function(v,index){
											if(v){
												context.beginPath();
												context.moveTo(pos.x,pos.y);
												context.lineTo(pos.x-_COS[index]*dist,pos.y-_SIN[index]*dist);
												context.stroke();
												context.closePath();							
											}
										});
								}
							}
						}
					}
				}
				// 添加北航标志性建筑
				var buildings = [
					{ x: 10, y: 5, name: '主楼' },
					{ x: 15, y: 10, name: '图书馆' }
					// 更多建筑...
				];

				context.fillStyle = '#8B4513'; // 建筑颜色
				buildings.forEach(function(building) {
					var pos = map.coord2position(building.x, building.y);
					context.fillRect(pos.x - map.size / 2, pos.y - map.size / 2, map.size, map.size);
					// 添加建筑名称
					context.fillStyle = '#FFF';
					context.font = '12px Arial';
					context.fillText(building.name, pos.x - map.size / 2, pos.y - map.size / 2 - 5);
				});
			}
		});
		//物品地图
		beans = stage.createMap({
			x:60,
			y:10,
			data:_DATA,
			frames:8,
			draw:function(context){
				for(var j=0; j<this.y_length; j++){
					for(var i=0; i<this.x_length; i++){
						if(!this.get(i,j)){
							var pos = this.coord2position(i,j);
							var key = i + ',' + j;
							if (_SPECIAL_GOODS[key]) {
								// 绘制特殊道具
								context.fillStyle = '#FFD700'; // 金色
								context.beginPath();
								context.arc(pos.x, pos.y, 6 + this.times % 2, 0, 2 * Math.PI, true);
								context.fill();
								context.closePath();
							} else if(_GOODS[key]) {
								context.fillStyle = "#F5F5DC";
								context.beginPath();
								context.arc(pos.x,pos.y,3+this.times%2,0,2*Math.PI,true);
								context.fill();
								context.closePath();
							}else{
								context.fillStyle = "#F5F5DC";
								context.fillRect(pos.x-2,pos.y-2,4,4);
							}
						}
					}
				}
			}
		});
		//得分
		stage.createItem({
			x:690,
			y:100,
			draw:function(context){
				context.font = 'bold 28px Helvetica';
				context.textAlign = 'left';
				context.textBaseline = 'bottom';
				context.fillStyle = '#C33';
				context.fillText('SCORE',this.x,this.y);
				context.font = '28px Helvetica';
				context.textAlign = 'left';
				context.textBaseline = 'top';
				context.fillStyle = '#FFF';
				context.fillText(_SCORE,this.x+12,this.y);
			}
		});
		//状态文字
		stage.createItem({
			x:690,
			y:320,
			frames:25,
			draw:function(context){
				if(stage.status==2&&this.times%2){
					context.font = '24px Helvetica';
					context.textAlign = 'left';
					context.textBaseline = 'center';
					context.fillStyle = '#09F';
					context.fillText('PAUSE',this.x,this.y);
				}
			}
		});
		//生命值
		stage.createItem({
			x:705,
			y:540,
			width:30,
			height:30,
			draw:function(context){
				for(var i=0;i<_LIFE-1;i++){
					var x=this.x+40*i,y=this.y;
					context.fillStyle = '#FFE600';
					context.beginPath();
					context.arc(x,y,this.width/2,.15*Math.PI,-.15*Math.PI,false);
					context.lineTo(x,y);
					context.closePath();
					context.fill();
				}
			}
		});
		//NPC
		for(var i=0;i<4;i++){
			stage.createItem({
				width:30,
				height:30,
				orientation:3,
				color:_COLOR[i],
				location:map,
				coord:{x:12+i,y:14},
				vector:{x:12+i,y:14},
				type:2,
				frames:10,
				speed:1,
				timeout:Math.floor(Math.random()*120),
				update:function(){
					var new_map;
					if(this.status==3&&!this.timeout){
						this.status = 1;
					}
					if(!this.coord.offset){			//到达坐标中心时计算
						if(this.status==1){
							if(!this.timeout){		//定时器
								new_map = JSON.parse(JSON.stringify(map.data).replace(/2/g,0));
								var id = this._id;
								items.forEach(function(item){
									if(item._id!=id&&item.status==1){	//NPC将其它所有还处于正常状态的NPC当成一堵墙
										new_map[item.coord.y][item.coord.x]=1;
									}
								});
								this.path = map.finder({
									map:new_map,
									start:this.coord,
									end:player.coord
								});
								if(this.path.length){
									this.vector = this.path[0];
								}
							}
						}else if(this.status==3){
							new_map = JSON.parse(JSON.stringify(map.data).replace(/2/g,0));
							var id = this._id;
							items.forEach(function(item){
								if(item._id!=id){
									new_map[item.coord.y][item.coord.x]=1;
								}
							});
							this.path = map.finder({
								map:new_map,
								start:player.coord,
								end:this.coord,
								type:'next'
							});
							if(this.path.length){
								this.vector = this.path[Math.floor(Math.random()*this.path.length)];
							}
						}else if(this.status==4){
							new_map = JSON.parse(JSON.stringify(map.data).replace(/2/g,0));
							this.path = map.finder({
								map:new_map,
								start:this.coord,
								end:this._params.coord
							});
							if(this.path.length){
								this.vector = this.path[0];
							}else{
								this.status = 1;
							}
						}
						//是否转变方向
						if(this.vector.change){
							this.coord.x = this.vector.x;
							this.coord.y = this.vector.y;
							var pos = map.coord2position(this.coord.x,this.coord.y);
							this.x = pos.x;
							this.y = pos.y;
						}
						//方向判定
						if(this.vector.x>this.coord.x){
							this.orientation = 0;
						}else if(this.vector.x<this.coord.x){
							this.orientation = 2;
						}else if(this.vector.y>this.coord.y){
							this.orientation = 1;
						}else if(this.vector.y<this.coord.y){
							this.orientation = 3;
						}
					}
					this.x += this.speed*_COS[this.orientation];
					this.y += this.speed*_SIN[this.orientation];
				},
				draw:function(context){
					// 将鬼魂替换为飞机形状，体现北航特色
					context.save();
					context.translate(this.x, this.y);
					context.rotate((Math.PI / 180) * this.orientation * 90); // 根据方向旋转

					// 绘制飞机机身
					context.fillStyle = this.color;
					context.beginPath();
					context.moveTo(0, -this.height / 2);
					context.lineTo(this.width / 2, this.height / 2);
					context.lineTo(-this.width / 2, this.height / 2);
					context.closePath();
					context.fill();

					// 绘制飞机机翼
					context.beginPath();
					context.moveTo(-this.width / 2, 0);
					context.lineTo(this.width / 2, 0);
					context.lineTo(0, this.height / 2);
					context.closePath();
					context.fill();

					context.restore();
				}
			});
		}
		items = stage.getItemsByType(2);
		//主角
		player = stage.createItem({
			width:30,
			height:30,
			type:1,
			location:map,
			coord:{x:13.5,y:23},
			orientation:2,
			speed:2,
			frames:10,
			invincible: false,  // 是否无敌状态
			update:function(){
				var coord = this.coord;
				if(!coord.offset){
					if(this.control.orientation!='undefined'){
						if(!map.get(coord.x+_COS[this.control.orientation],coord.y+_SIN[this.control.orientation])){
							this.orientation = this.control.orientation;
						}
					}
					this.control = {};
					var value = map.get(coord.x+_COS[this.orientation],coord.y+_SIN[this.orientation]);
					if(value==0){
						this.x += this.speed*_COS[this.orientation];
						this.y += this.speed*_SIN[this.orientation];
					}else if(value<0){
						this.x -= map.size*(map.x_length-1)*_COS[this.orientation];
						this.y -= map.size*(map.y_length-1)*_SIN[this.orientation];
					}
				}else{
					var key = this.coord.x + ',' + this.coord.y;
					if(!beans.get(this.coord.x,this.coord.y)){	//吃豆
						_SCORE++;
						beans.set(this.coord.x,this.coord.y,1);
						if(_GOODS[key]){	//吃到能量豆
							items.forEach(function(item){
								if(item.status==1||item.status==3){	//如果NPC为正常状态，则置为临时状态
									item.timeout = 450;
									item.status = 3;
								}
							});
						}
					}
					// 处理特殊道具
					if (_SPECIAL_GOODS[key]) {
						var item = _SPECIAL_GOODS[key];
						delete _SPECIAL_GOODS[key];
						switch (item) {
							case 'rocket':
								// 吃到火箭，速度增加
								this.speed += 1;
								var self = this;
								setTimeout(function() {
									self.speed -= 1;
								}, 5000); // 5秒后恢复速度
								break;
							case 'satellite':
								// 吃到卫星，获得无敌状态
								this.invincible = true;
								setTimeout(function() {
									self.invincible = false;
								}, 5000); // 5秒后失去无敌
								break;
						}
					}

					this.x += this.speed*_COS[this.orientation];
					this.y += this.speed*_SIN[this.orientation];
				}
			},
			draw:function(context){
				context.fillStyle = '#FFE600';
				context.beginPath();
				if(stage.status!=3){	//玩家正常状态
					if(this.times%2){
						context.arc(this.x,this.y,this.width/2,(.5*this.orientation+.20)*Math.PI,(.5*this.orientation-.20)*Math.PI,false);
					}else{
						context.arc(this.x,this.y,this.width/2,(.5*this.orientation+.01)*Math.PI,(.5*this.orientation-.01)*Math.PI,false);
					}
				}else{	//玩家被吃
					if(stage.timeout) {
						context.arc(this.x,this.y,this.width/2,(.5*this.orientation+1-.02*stage.timeout)*Math.PI,(.5*this.orientation-1+.02*stage.timeout)*Math.PI,false);
					}
				}
				context.lineTo(this.x,this.y);
				context.closePath();
				context.fill();
			}
		});
		//事件绑定
		stage.bind('keydown',function(e){
			switch(e.keyCode){
				case 13: //回车
				case 32: //空格
				this.status = this.status==2?1:2;
				break;
				case 39: //右
				player.control = {orientation:0};
				break;
				case 40: //下
				player.control = {orientation:1};
				break;
				case 37: //左
				player.control = {orientation:2};
				break;
				case 38: //上
				player.control = {orientation:3};
				break;
			}
		});
	})();
	//结束画面
	(function(){
		var stage = game.createStage();
		//游戏结束
		stage.createItem({
			x:game.width/2,
			y:game.height*.35,
			draw:function(context){
				context.fillStyle = '#FFF';
				context.font = 'bold 48px Helvetica';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText('游戏结束',this.x,this.y);
			}
		});
		//记分
		stage.createItem({
			x:game.width/2,
			y:game.height*.5,
			draw:function(context){
				context.fillStyle = '#FFF';
				context.font = '20px Helvetica';
				context.textAlign = 'center';
				context.textBaseline = 'middle';
				context.fillText('最终得分: '+(_SCORE+50*Math.max(_LIFE-1,0)),this.x,this.y);
			}
		});
		//事件绑定
		stage.bind('keydown',function(e){
			switch(e.keyCode){
				case 13: //回车
				case 32: //空格
				_SCORE = 0;
				_LIFE = 3;
				var st = game.setStage(1);
				st.reset();
				break;
			}
		});
	})();
	game.init();
})();
