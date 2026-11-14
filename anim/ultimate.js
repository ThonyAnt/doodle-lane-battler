// The ultimate (move `fleet` in the rules): the fighter sinks, floats up with the weapon raised while copies of the
// drawing gather in a fan overhead, then snaps the arm down at the foe to send them, and hangs there until the volley is out.
// The rules lift the fighter a little during the rise; the tucked feet here add the rest of the float.
(function(){
  const A=ANIM, P=A.P;
  // Sunk and coiled: the anticipation before the rise.
  const COIL=P('ready',{hips:[-2,-46],neck:[-12,-98],head:[-12,-121],fh:[10,-66],bh:[-30,-62],ang:1.0});
  // Aloft: chest open, weapon straight up, back arm thrown wide, legs tucked one above the other.
  const RISE=P('cheer',{hips:[0,-92],neck:[-6,-146],head:[-12,-168],fh:[14,-212],bh:[-58,-158],f1:[-20,-26],k1:[-30,-62],f2:[16,-44],k2:[28,-72],ang:-1.62});
  const HOLD=P(RISE,{hips:[0,-96],neck:[-9,-150],head:[-17,-171],fh:[6,-216],bh:[-64,-166],f1:[-22,-30],f2:[14,-48],ang:-1.78});
  // The command: the whole body whips forward and the weapon points at the foe.
  const SEND=P(RISE,{hips:[0,-90],neck:[12,-143],head:[26,-162],fh:[70,-136],bh:[-36,-112],f1:[-34,-22],k1:[-30,-58],f2:[10,-36],k2:[26,-66],ang:0.12});
  const KEEP=P(SEND,{neck:[10,-144],head:[23,-164],fh:[66,-140],bh:[-40,-118],ang:0.04});
  A.add('fleet',{dur:1.5,weapon:'blade',punch:0,
    keys:[
      {t:0,   p:'ready'},
      {t:.12, p:COIL,ease:'out'},
      {t:.36, p:RISE,ease:'snap'},
      {t:.54, p:HOLD,ease:'smooth'},
      {t:.62, p:SEND,ease:'in'},
      {t:.70, p:P(SEND,{fh:[74,-130],ang:0.2}),ease:'out'},
      {t:1.22,p:KEEP,ease:'smooth'},
      {t:1.38,p:P('ready',{hips:[0,-54],neck:[-10,-106],head:[-10,-129]}),ease:'in'},
      {t:1.5, p:'ready',ease:'out'}
    ],
    trail:[[.56,.68]], marks:[{t:.62,type:'cast'}]});
})();
