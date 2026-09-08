(function(){
  'use strict';
  var COLOURS = {'--gorse':'#F2B134','--tidepool':'#4FB3A5','--slate':'#7B93E0','--heather':'#C9739B','--grey':'#5A6069'};
  var colour = function(v){ return COLOURS[v] || COLOURS['--gorse']; };

  // Short picker labels. The engine's own session names come from whichever
  // template is loaded (they differ per template — "Max Hangs" vs "Finger
  // Strength"), so the picker uses stable generic wording instead.
  var PICKER = [
    {k:'maxFingers', label:'Max fingers',  c:'--gorse'},
    {k:'hangboard',  label:'Repeaters',    c:'--slate'},
    {k:'pull',       label:'Pull',         c:'--tidepool'},
    {k:'climbHard',  label:'Hard climb',   c:'--heather'},
    {k:'outdoorHard',label:'Outdoor',      c:'--heather'},
    {k:'climbEasy',  label:'Easy climb',   c:'--tidepool'},
    {k:'rest',       label:'Rest',         c:'--grey'}
  ];
  var DAYS = [{n:3,label:'Three days ago'},{n:2,label:'Two days ago'},{n:1,label:'Yesterday'}];
  var EQUIP = [{k:'hangboard',label:'Hangboard'},{k:'pullBar',label:'Pull-up bar'},{k:'gym',label:'Gym'},{k:'pickupRig',label:'Pickup rig'}];

  var state = {
    log: {3:'maxFingers', 2:'climbHard', 1:'rest'},
    discipline:'bouldering', level:'intermediate', days:4,
    equipment:['hangboard','pullBar']
  };

  var today = EngineCore.today();
  var el = function(id){ return document.getElementById(id); };

  function chip(label, on, c, onClick){
    var b = document.createElement('button');
    b.className = 'chip'; b.type = 'button'; b.textContent = label;
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (c) b.style.setProperty('--chipc', colour(c));
    b.addEventListener('click', onClick);
    return b;
  }

  function buildDayPicker(){
    var host = el('daypicker'); host.innerHTML = '';
    DAYS.forEach(function(d){
      var row = document.createElement('div'); row.className = 'dayrow';
      var lab = document.createElement('span'); lab.className = 'fieldlabel'; lab.textContent = d.label;
      var chips = document.createElement('div'); chips.className = 'chips';
      PICKER.forEach(function(s){
        chips.appendChild(chip(s.label, state.log[d.n] === s.k, s.c, function(){
          state.log[d.n] = s.k; render();
        }));
      });
      row.appendChild(lab); row.appendChild(chips); host.appendChild(row);
    });
  }

  function buildControls(){
    var disc = el('ctl-discipline'); disc.innerHTML = '';
    [['bouldering','Bouldering'],['sport','Sport']].forEach(function(p){
      disc.appendChild(chip(p[1], state.discipline === p[0], null, function(){ state.discipline = p[0]; render(); }));
    });
    var lvl = el('ctl-level'); lvl.innerHTML = '';
    [['intermediate','Intermediate'],['advanced','Advanced']].forEach(function(p){
      lvl.appendChild(chip(p[1], state.level === p[0], null, function(){ state.level = p[0]; render(); }));
    });
    var eq = el('ctl-equip'); eq.innerHTML = '';
    EQUIP.forEach(function(e){
      eq.appendChild(chip(e.label, state.equipment.indexOf(e.k) !== -1, null, function(){
        var i = state.equipment.indexOf(e.k);
        if (i === -1) state.equipment.push(e.k); else state.equipment.splice(i,1);
        render();
      }));
    });
    el('days-val').textContent = state.days;
  }

  function buildProgram(){
    var id = state.discipline + state.level.charAt(0).toUpperCase() + state.level.slice(1);
    // Start date is set 10 weeks back so the demo lands mid-plan rather than
    // on week one of block one, which is the least interesting thing to show.
    var start = EngineCore.addDays(today, -70);
    return TemplateResolver.resolveTemplate(TEMPLATES[id], {
      startDate: start,
      modifiers: { daysPerWeek: state.days, equipment: state.equipment.slice() }
    });
  }

  function sessionLog(){
    var log = {};
    DAYS.forEach(function(d){
      var k = state.log[d.n];
      if (k) log[EngineCore.addDays(today, -d.n)] = { t: k };
    });
    return log;
  }

  function render(){
    buildDayPicker(); buildControls();

    var program = buildProgram();
    var engine = EngineCore.createEngine(program, { sessionLog: sessionLog(), loadLog: {} });
    var decision = engine.decide(today);
    var info = program.sessions[decision.k] || {};
    var c = colour(info.c);

    var r = el('today-readout');
    r.innerHTML = '';
    var day = document.createElement('div'); day.className = 'rday'; day.textContent = 'Today';
    var name = document.createElement('div'); name.className = 'rname'; name.style.color = c;
    name.textContent = info.n || decision.k;
    var where = document.createElement('div'); where.className = 'rwhere'; where.textContent = info.w || '';
    var why = document.createElement('div'); why.className = 'rwhy';
    var whyLab = document.createElement('b'); whyLab.textContent = "Why this, today";
    var whyTxt = document.createElement('span'); whyTxt.textContent = decision.why || '';
    why.appendChild(whyLab); why.appendChild(whyTxt);
    r.appendChild(day); r.appendChild(name); r.appendChild(where); r.appendChild(why);

    if (info.x && info.x.length){
      var ul = document.createElement('ul'); ul.className = 'exlist';
      info.x.forEach(function(ex){
        var li = document.createElement('li');
        var a = document.createElement('span'); a.textContent = ex.t;
        var b = document.createElement('span'); b.textContent = ex.m || '';
        li.appendChild(a); li.appendChild(b); ul.appendChild(li);
      });
      r.appendChild(ul);
    }

    // forecast() starts at today, so drop the first entry — the card above is today.
    var fc = engine.forecast(4).slice(1, 4);
    var host = el('next3'); host.innerHTML = '';
    fc.forEach(function(f){
      var d = document.createElement('div'); d.className = 'n3';
      var when = document.createElement('div'); when.className = 'd';
      when.textContent = new Date(f.date + 'T12:00:00').toLocaleDateString('en-GB',{weekday:'short', day:'numeric', month:'short'});
      var nm = document.createElement('div'); nm.className = 'n';
      var dot = document.createElement('span'); dot.className = 'dot';
      // Colour rides the dot, not the label — session colours are tuned for
      // swatches and some of them fail contrast as 14px text.
      dot.style.background = colour(f.colour);
      var lab = document.createElement('span'); lab.textContent = f.name;
      nm.appendChild(dot); nm.appendChild(lab);
      d.appendChild(when); d.appendChild(nm); host.appendChild(d);
    });
  }

  el('days-up').addEventListener('click', function(){ if (state.days < 6){ state.days++; render(); } });
  el('days-down').addEventListener('click', function(){ if (state.days > 2){ state.days--; render(); } });

  render();
})();
