// Worked example of a clip, for reference when authoring. Not used by the game.
// A single downward cut: settle into a stance, wind up behind the head, cut fast through contact
// with the arm pinned to the shoulder (orbit), overshoot, then recover.
(function(){
  const P=ANIM.P;
  ANIM.add('example_slash',{
    dur:0.5, weapon:'blade',
    keys:[
      {t:0.00, p:'ready'},
      // anticipation: weight shifts to the back foot, blade goes up and behind
      {t:0.12, p:P('wind',{neck:[12,-125],head:[3,-150],ang:-2.4}), orbit:1, grip:1, ease:'out'},
      // contact: arrive fast (snap), body thrown forward over the front knee
      {t:0.20, p:P('slash',{neck:[12,-125],head:[23,-150],ang:0.06}), orbit:1, grip:1, ease:'snap'},
      // follow-through: blade carries past the target and low
      {t:0.30, p:P('follow',{neck:[12,-125],head:[28,-150],ang:1.08}), orbit:1, grip:1, ease:'out'},
      // recover
      {t:0.50, p:'ready', ease:'smooth'}
    ],
    trail:[[0.12,0.27]],
    marks:[{t:0.20,type:'hit'}]
  });
})();
