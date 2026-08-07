export type JobCardTemplate = {
  arrowClassName: string;
  backgroundColor: string;
  backgroundImage: string;
  backgroundPosition: string;
  backgroundSize: string;
  borderClassName: string;
  companyClassName: string;
  contentClassName: string;
  contentFrameClassName?: string;
  dividerClassName: string;
  glow: string;
  id: string;
  insightClassName: string;
  locationClassName: string;
  metaClassName: string;
  previewBorderClassName: string;
  previewVeilClassName: string;
  separatorClassName: string;
  titleClassName: string;
};

export const JOB_CARD_TEMPLATES = [
  {
    id: "midnight-sapphire",
    backgroundColor: "#02040d",
    backgroundImage:
      "linear-gradient(92deg, rgb(1 4 14 / .84) 0%, rgb(3 8 25 / .68) 62%, rgb(5 12 32 / .28) 100%), linear-gradient(180deg, transparent, rgb(0 2 9 / .48)), url('/visuals/obsidian-liquid-glass-v1.jpg')",
    backgroundPosition: "48% center",
    backgroundSize: "cover",
    glow:
      "linear-gradient(128deg, transparent 18%, rgb(115 153 255 / .13) 45%, transparent 59%)",
    borderClassName: "border-[#9bb7ff]/35 text-white",
    previewBorderClassName:
      "border-[#829fff]/25 text-white opacity-[0.94]",
    contentClassName: "top-[26%]",
    companyClassName: "text-[#cbd8ff]",
    dividerClassName: "bg-[#b8c9ff]/24",
    titleClassName:
      "font-serif text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.7)]",
    metaClassName: "text-[#f3f6ff]",
    separatorClassName: "text-[#7891ca]",
    locationClassName: "text-[#c1cbea]",
    insightClassName: "text-[#b7c5e8]",
    arrowClassName:
      "border-[#c9d6ff]/20 bg-[#dbe3ff]/[0.07] text-white shadow-[0_10px_30px_rgba(0,0,0,.42)]",
    previewVeilClassName:
      "bg-[#020510]/25 shadow-[inset_0_0_0_1px_rgba(180,199,255,.15)]",
  },
  {
    id: "amethyst-nocturne",
    backgroundColor: "#090510",
    backgroundImage:
      "linear-gradient(94deg, rgb(10 4 18 / .86) 0%, rgb(22 8 34 / .69) 64%, rgb(32 10 51 / .27) 100%), linear-gradient(180deg, rgb(12 4 22 / .08), rgb(5 2 10 / .52)), url('/visuals/obsidian-liquid-glass-v1.jpg')",
    backgroundPosition: "72% center",
    backgroundSize: "112% auto",
    glow:
      "linear-gradient(135deg, transparent 20%, rgb(220 164 255 / .12) 47%, transparent 62%)",
    borderClassName: "border-[#ddb5ff]/32 text-white",
    previewBorderClassName:
      "border-[#c99aff]/24 text-white opacity-[0.94]",
    contentClassName: "top-[23%]",
    companyClassName: "text-[#eddbff]",
    dividerClassName: "bg-[#e2c2ff]/23",
    titleClassName:
      "font-sans font-medium text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.72)]",
    metaClassName: "text-[#fcf6ff]",
    separatorClassName: "text-[#af7fd0]",
    locationClassName: "text-[#dcc7e8]",
    insightClassName: "text-[#d3bde2]",
    arrowClassName:
      "border-[#efd7ff]/20 bg-[#e9d1ff]/[0.07] text-[#fff8ff] shadow-[0_10px_30px_rgba(0,0,0,.44)]",
    previewVeilClassName:
      "bg-[#0b0512]/27 shadow-[inset_0_0_0_1px_rgba(229,191,255,.14)]",
  },
  {
    id: "emerald-onyx",
    backgroundColor: "#010805",
    backgroundImage:
      "linear-gradient(92deg, rgb(0 7 5 / .86) 0%, rgb(1 14 10 / .68) 64%, rgb(2 22 15 / .24) 100%), linear-gradient(180deg, transparent, rgb(0 4 3 / .54)), url('/visuals/card-emerald-smoke-v1.jpg')",
    backgroundPosition: "43% center",
    backgroundSize: "cover",
    glow:
      "linear-gradient(130deg, transparent 22%, rgb(121 255 193 / .11) 49%, transparent 62%)",
    borderClassName: "border-emerald-200/28 text-white",
    previewBorderClassName:
      "border-emerald-200/20 text-white opacity-[0.94]",
    contentClassName: "top-[25%]",
    companyClassName: "text-[#d8ffea]",
    dividerClassName: "bg-emerald-100/22",
    titleClassName:
      "font-sans font-medium text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.72)]",
    metaClassName: "text-[#f1fff7]",
    separatorClassName: "text-[#6eac8b]",
    locationClassName: "text-[#bfe0cf]",
    insightClassName: "text-[#afd5c1]",
    arrowClassName:
      "border-emerald-100/18 bg-emerald-50/[0.065] text-[#effff6] shadow-[0_10px_30px_rgba(0,0,0,.45)]",
    previewVeilClassName:
      "bg-[#010806]/28 shadow-[inset_0_0_0_1px_rgba(190,255,222,.13)]",
  },
  {
    id: "malachite-edge",
    backgroundColor: "#04100b",
    backgroundImage:
      "linear-gradient(96deg, rgb(2 11 8 / .88) 0%, rgb(4 22 15 / .71) 67%, rgb(5 41 27 / .22) 100%), linear-gradient(180deg, rgb(0 8 5 / .04), rgb(1 7 5 / .54)), url('/visuals/card-emerald-smoke-v1.jpg')",
    backgroundPosition: "68% center",
    backgroundSize: "116% auto",
    glow:
      "linear-gradient(121deg, transparent 15%, rgb(188 255 219 / .12) 43%, transparent 55%)",
    borderClassName: "border-[#9be1bc]/30 text-white",
    previewBorderClassName:
      "border-[#8bcfae]/22 text-white opacity-[0.94]",
    contentClassName: "top-[29%]",
    companyClassName: "text-[#c9f5dc]",
    dividerClassName: "bg-[#b7e9ce]/22",
    titleClassName:
      "font-serif text-[#fbfffc] drop-shadow-[0_3px_20px_rgba(0,0,0,.75)]",
    metaClassName: "text-[#effaf4]",
    separatorClassName: "text-[#78a98e]",
    locationClassName: "text-[#bfd5c9]",
    insightClassName: "text-[#b4cfc0]",
    arrowClassName:
      "border-[#c9f5dc]/18 bg-[#d9ffea]/[0.06] text-[#f3fff8] shadow-[0_10px_30px_rgba(0,0,0,.46)]",
    previewVeilClassName:
      "bg-[#03100a]/27 shadow-[inset_0_0_0_1px_rgba(174,234,202,.13)]",
  },
  {
    id: "graphite-ice",
    backgroundColor: "#080d12",
    backgroundImage:
      "linear-gradient(92deg, rgb(5 10 15 / .88) 0%, rgb(10 18 25 / .75) 67%, rgb(17 29 38 / .42) 100%), linear-gradient(180deg, rgb(4 8 12 / .18), rgb(2 5 8 / .64)), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "38% center",
    backgroundSize: "cover",
    glow:
      "linear-gradient(128deg, transparent 17%, rgb(214 239 255 / .12) 45%, transparent 58%)",
    borderClassName: "border-[#d4e8f5]/30 text-white",
    previewBorderClassName:
      "border-[#c5dce9]/22 text-white opacity-[0.94]",
    contentClassName: "top-[27%]",
    companyClassName: "text-[#dcecf5]",
    dividerClassName: "bg-[#d9eaf4]/22",
    titleClassName:
      "font-serif text-white drop-shadow-[0_3px_20px_rgba(0,0,0,.78)]",
    metaClassName: "text-[#f5fbff]",
    separatorClassName: "text-[#839dab]",
    locationClassName: "text-[#c7d6de]",
    insightClassName: "text-[#b7cad4]",
    arrowClassName:
      "border-[#d9ecf7]/19 bg-[#e9f7ff]/[0.065] text-white shadow-[0_10px_32px_rgba(0,0,0,.48)]",
    previewVeilClassName:
      "bg-[#071018]/26 shadow-[inset_0_0_0_1px_rgba(215,238,250,.14)]",
  },
  {
    id: "arctic-slate-glass",
    backgroundColor: "#07131b",
    backgroundImage:
      "linear-gradient(96deg, rgb(4 15 23 / .9) 0%, rgb(7 27 39 / .74) 66%, rgb(10 45 61 / .4) 100%), linear-gradient(180deg, transparent, rgb(2 10 16 / .62)), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "75% center",
    backgroundSize: "114% auto",
    glow:
      "linear-gradient(136deg, transparent 23%, rgb(175 235 255 / .13) 50%, transparent 64%)",
    borderClassName: "border-[#b9e8f5]/30 text-white",
    previewBorderClassName:
      "border-[#9ed3e3]/22 text-white opacity-[0.94]",
    contentClassName: "top-[24%]",
    companyClassName: "text-[#cceff8]",
    dividerClassName: "bg-[#c8edf5]/22",
    titleClassName:
      "font-sans font-medium text-white drop-shadow-[0_3px_20px_rgba(0,0,0,.76)]",
    metaClassName: "text-[#f3fcff]",
    separatorClassName: "text-[#72a4b4]",
    locationClassName: "text-[#b8d7e0]",
    insightClassName: "text-[#add0da]",
    arrowClassName:
      "border-[#caeff7]/19 bg-[#d8f7ff]/[0.065] text-[#f5fdff] shadow-[0_10px_30px_rgba(0,0,0,.47)]",
    previewVeilClassName:
      "bg-[#06151e]/27 shadow-[inset_0_0_0_1px_rgba(186,231,243,.14)]",
  },
  {
    id: "bordeaux-glass",
    backgroundColor: "#120809",
    backgroundImage:
      "linear-gradient(92deg, rgb(18 6 8 / .88) 0%, rgb(38 12 17 / .72) 65%, rgb(66 20 27 / .31) 100%), linear-gradient(180deg, transparent, rgb(12 4 6 / .58)), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "42% center",
    backgroundSize: "cover",
    glow:
      "linear-gradient(130deg, transparent 17%, rgb(255 184 184 / .13) 44%, transparent 58%)",
    borderClassName: "border-[#ffc6c1]/30 text-white",
    previewBorderClassName:
      "border-[#efa9a7]/22 text-white opacity-[0.94]",
    contentClassName: "top-[25%]",
    companyClassName: "text-[#ffe2de]",
    dividerClassName: "bg-[#ffd5d0]/23",
    titleClassName:
      "font-serif text-white drop-shadow-[0_3px_20px_rgba(0,0,0,.76)]",
    metaClassName: "text-[#fff7f5]",
    separatorClassName: "text-[#bf8582]",
    locationClassName: "text-[#e4c5c1]",
    insightClassName: "text-[#dbb9b6]",
    arrowClassName:
      "border-[#ffd9d4]/19 bg-[#ffe7e2]/[0.07] text-[#fff8f6] shadow-[0_10px_30px_rgba(0,0,0,.46)]",
    previewVeilClassName:
      "bg-[#16090b]/27 shadow-[inset_0_0_0_1px_rgba(250,197,191,.14)]",
  },
  {
    id: "copper-noir",
    backgroundColor: "#100b08",
    backgroundImage:
      "linear-gradient(95deg, rgb(14 9 6 / .9) 0%, rgb(34 21 13 / .73) 66%, rgb(66 39 20 / .3) 100%), linear-gradient(180deg, rgb(18 10 5 / .05), rgb(9 6 4 / .6)), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "70% center",
    backgroundSize: "115% auto",
    glow:
      "linear-gradient(124deg, transparent 15%, rgb(255 198 143 / .13) 43%, transparent 57%)",
    borderClassName: "border-[#e8b17c]/32 text-white",
    previewBorderClassName:
      "border-[#d89d68]/23 text-white opacity-[0.94]",
    contentClassName: "top-[29%]",
    companyClassName: "text-[#f6cfaa]",
    dividerClassName: "bg-[#f0c39b]/22",
    titleClassName:
      "font-sans font-medium text-[#fffdf9] drop-shadow-[0_3px_20px_rgba(0,0,0,.78)]",
    metaClassName: "text-[#fff8f0]",
    separatorClassName: "text-[#ad7f58]",
    locationClassName: "text-[#ddc4ad]",
    insightClassName: "text-[#d2b69e]",
    arrowClassName:
      "border-[#f2c69e]/19 bg-[#ffdcbb]/[0.065] text-[#fffaf5] shadow-[0_10px_30px_rgba(0,0,0,.48)]",
    previewVeilClassName:
      "bg-[#130c08]/28 shadow-[inset_0_0_0_1px_rgba(236,181,132,.14)]",
  },
  {
    id: "silver-editorial",
    backgroundColor: "#eef6fb",
    backgroundImage:
      "linear-gradient(90deg, rgb(251 253 255 / .9) 0%, rgb(247 251 254 / .7) 58%, rgb(239 247 252 / .28) 100%), linear-gradient(180deg, rgb(255 255 255 / .08), rgb(220 236 246 / .2)), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "42% center",
    backgroundSize: "cover",
    glow:
      "radial-gradient(circle at 78% 18%, rgb(255 255 255 / .8), transparent 34%)",
    borderClassName: "border-white/[0.86] text-[#081724]",
    previewBorderClassName:
      "border-white/80 text-[#081724] opacity-[0.96]",
    contentClassName: "top-[22%]",
    companyClassName: "text-[#31566e]",
    dividerClassName: "bg-[#173d58]/15",
    titleClassName:
      "font-serif font-normal text-[#071722] drop-shadow-[0_2px_18px_rgba(255,255,255,.86)]",
    metaClassName: "text-[#15384f]",
    separatorClassName: "text-[#7893a6]",
    locationClassName: "text-[#45677e]",
    insightClassName: "text-[#365d76]",
    arrowClassName:
      "border-white/80 bg-white/50 text-[#0d2d43] shadow-[0_10px_30px_rgba(31,73,101,.14)] backdrop-blur-md",
    previewVeilClassName:
      "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.64)]",
  },
  {
    id: "pearl-atmosphere",
    backgroundColor: "#f2f3fb",
    backgroundImage:
      "linear-gradient(135deg, rgb(255 255 255 / .52), rgb(235 239 255 / .18)), url('/visuals/glass-atmosphere-v1.jpg')",
    backgroundPosition: "center",
    backgroundSize: "cover",
    glow:
      "radial-gradient(circle at 18% 12%, rgb(255 255 255 / .9), transparent 42%)",
    borderClassName: "border-white/80 text-[#161b35]",
    previewBorderClassName:
      "border-white/75 text-[#161b35] opacity-[0.96]",
    contentClassName: "top-[18%]",
    contentFrameClassName:
      "rounded-[1.6rem] border border-white/70 bg-white/35 px-5 py-5 shadow-[0_22px_70px_rgba(81,96,146,.12)] backdrop-blur-xl",
    companyClassName: "text-[#5b5f91]",
    dividerClassName: "bg-white/80",
    titleClassName:
      "font-sans text-[1.9rem] font-semibold leading-[0.98] tracking-[-0.045em] text-[#11162d] sm:text-[2.15rem]",
    metaClassName: "text-[#303653]",
    separatorClassName: "text-[#9398b8]",
    locationClassName: "text-[#626985]",
    insightClassName: "text-[#545b79]",
    arrowClassName:
      "border-white/80 bg-white/55 text-[#3e477c] shadow-[0_10px_30px_rgba(83,90,145,.14)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-white/[0.05] shadow-[inset_0_0_0_1px_rgba(255,255,255,.7)]",
  },
  {
    id: "ice-ledger",
    backgroundColor: "#eaf3f8",
    backgroundImage:
      "linear-gradient(102deg, rgb(248 252 255 / .88) 0%, rgb(239 248 253 / .65) 54%, rgb(228 241 249 / .18) 100%), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "22% center",
    backgroundSize: "118% auto",
    glow:
      "linear-gradient(90deg, rgb(255 255 255 / .42), transparent 66%)",
    borderClassName: "border-[#eaf7ff] text-[#0b2435]",
    previewBorderClassName:
      "border-white/80 text-[#0b2435] opacity-[0.96]",
    contentClassName: "top-[23%]",
    contentFrameClassName:
      "border-l border-[#2c5875]/20 pl-5 pr-2",
    companyClassName: "text-[#3f657e]",
    dividerClassName: "bg-[#244e68]/16",
    titleClassName:
      "font-sans text-[1.95rem] font-medium leading-[0.97] tracking-[-0.05em] text-[#0a2435] sm:text-[2.25rem]",
    metaClassName: "text-[#20445b]",
    separatorClassName: "text-[#83a0b2]",
    locationClassName: "text-[#55758a]",
    insightClassName: "text-[#42677f]",
    arrowClassName:
      "border-[#cfe1ec]/80 bg-[#f8fcff]/60 text-[#123b53] shadow-[0_9px_28px_rgba(50,86,110,.13)] backdrop-blur-md",
    previewVeilClassName:
      "bg-[#edf7fc]/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.6)]",
  },
  {
    id: "opal-journal",
    backgroundColor: "#eef0fa",
    backgroundImage:
      "linear-gradient(160deg, rgb(255 255 255 / .2), rgb(224 232 255 / .24)), url('/visuals/glass-atmosphere-v1.jpg')",
    backgroundPosition: "66% center",
    backgroundSize: "125% auto",
    glow:
      "radial-gradient(circle at 72% 10%, rgb(218 229 255 / .58), transparent 38%)",
    borderClassName: "border-white/80 text-[#171d38]",
    previewBorderClassName:
      "border-white/70 text-[#171d38] opacity-[0.96]",
    contentClassName: "top-[20%]",
    contentFrameClassName:
      "rounded-[1.75rem] border border-white/65 bg-[#f8f9ff]/40 px-5 py-5 shadow-[0_24px_72px_rgba(79,86,135,.13)] backdrop-blur-lg",
    companyClassName: "text-[#666994]",
    dividerClassName: "bg-white/75",
    titleClassName:
      "font-serif text-[1.9rem] font-normal leading-[0.98] tracking-[-0.045em] text-[#14192e] sm:text-[2.2rem]",
    metaClassName: "text-[#343a59]",
    separatorClassName: "text-[#999db9]",
    locationClassName: "text-[#666c8a]",
    insightClassName: "text-[#575e7c]",
    arrowClassName:
      "border-white/80 bg-white/50 text-[#424b7d] shadow-[0_10px_32px_rgba(67,76,128,.14)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.72)]",
  },
  {
    id: "cloud-blueprint",
    backgroundColor: "#e5f0f7",
    backgroundImage:
      "linear-gradient(120deg, rgb(236 247 253 / .7), rgb(209 229 242 / .18)), linear-gradient(90deg, rgb(247 252 255 / .72), transparent 74%), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "82% center",
    backgroundSize: "cover",
    glow:
      "radial-gradient(circle at 88% 34%, rgb(183 220 244 / .34), transparent 38%)",
    borderClassName: "border-[#eefaff]/90 text-[#09243a]",
    previewBorderClassName:
      "border-white/80 text-[#09243a] opacity-[0.96]",
    contentClassName: "top-[19%]",
    contentFrameClassName:
      "rounded-[1.5rem] bg-[#f7fbff]/55 px-5 py-5 shadow-[0_20px_62px_rgba(48,91,123,.12)] ring-1 ring-white/70 backdrop-blur-md",
    companyClassName: "text-[#39647f]",
    dividerClassName: "bg-[#34637f]/15",
    titleClassName:
      "font-sans text-[1.9rem] font-semibold leading-[0.98] tracking-[-0.05em] text-[#082238] sm:text-[2.18rem]",
    metaClassName: "text-[#21475f]",
    separatorClassName: "text-[#84a2b5]",
    locationClassName: "text-[#55778d]",
    insightClassName: "text-[#456b83]",
    arrowClassName:
      "border-white/80 bg-[#f8fcff]/60 text-[#17445e] shadow-[0_9px_30px_rgba(45,88,117,.14)] backdrop-blur-lg",
    previewVeilClassName:
      "bg-[#e7f3fa]/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.66)]",
  },
  {
    id: "blush-quartz",
    backgroundColor: "#f3e8e4",
    backgroundImage:
      "linear-gradient(100deg, rgb(255 250 248 / .9) 0%, rgb(252 241 237 / .78) 58%, rgb(248 227 221 / .6) 100%), linear-gradient(180deg, rgb(255 255 255 / .1), rgb(229 201 194 / .12)), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "52% 35%",
    backgroundSize: "cover",
    glow:
      "radial-gradient(circle at 82% 14%, rgb(255 225 216 / .62), transparent 38%)",
    borderClassName: "border-[#fff7f3]/90 text-[#2c1c1d]",
    previewBorderClassName:
      "border-[#fff5f0]/80 text-[#2c1c1d] opacity-[0.96]",
    contentClassName: "top-[21%]",
    companyClassName: "text-[#8a5a5c]",
    dividerClassName: "bg-[#704448]/16",
    titleClassName:
      "font-serif font-normal text-[#2a191b] drop-shadow-[0_2px_18px_rgba(255,255,255,.8)]",
    metaClassName: "text-[#57383b]",
    separatorClassName: "text-[#b58d8e]",
    locationClassName: "text-[#805e60]",
    insightClassName: "text-[#704e51]",
    arrowClassName:
      "border-white/75 bg-white/45 text-[#744b50] shadow-[0_10px_30px_rgba(104,64,67,.13)] backdrop-blur-md",
    previewVeilClassName:
      "bg-[#fff8f5]/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.62)]",
  },
  {
    id: "rose-ledger",
    backgroundColor: "#f0e1df",
    backgroundImage:
      "linear-gradient(108deg, rgb(255 249 247 / .92) 0%, rgb(248 233 229 / .76) 60%, rgb(225 194 189 / .48) 100%), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "78% top",
    backgroundSize: "115% auto",
    glow:
      "linear-gradient(135deg, transparent 22%, rgb(255 255 255 / .42) 48%, transparent 63%)",
    borderClassName: "border-[#fff4f0]/90 text-[#321e24]",
    previewBorderClassName:
      "border-[#fff4ef]/80 text-[#321e24] opacity-[0.96]",
    contentClassName: "top-[24%]",
    contentFrameClassName:
      "border-l-2 border-[#9c656a]/20 pl-5 pr-2",
    companyClassName: "text-[#936068]",
    dividerClassName: "bg-[#75464e]/15",
    titleClassName:
      "font-sans text-[1.92rem] font-medium leading-[0.98] tracking-[-0.05em] text-[#321d24] sm:text-[2.2rem]",
    metaClassName: "text-[#624047]",
    separatorClassName: "text-[#b78e92]",
    locationClassName: "text-[#89656a]",
    insightClassName: "text-[#76545a]",
    arrowClassName:
      "border-[#fff8f5]/85 bg-white/45 text-[#814f58] shadow-[0_9px_28px_rgba(105,65,72,.13)] backdrop-blur-md",
    previewVeilClassName:
      "bg-[#fff6f3]/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.64)]",
  },
  {
    id: "alabaster-gallery",
    backgroundColor: "#f2f4fb",
    backgroundImage:
      "linear-gradient(92deg, rgb(252 253 255 / .76) 0%, rgb(244 247 255 / .56) 62%, rgb(229 237 255 / .2) 100%), url('/visuals/glass-atmosphere-v1.jpg')",
    backgroundPosition: "72% center",
    backgroundSize: "cover",
    glow:
      "radial-gradient(circle at 14% 78%, rgb(217 230 255 / .55), transparent 42%)",
    borderClassName: "border-white/[0.86] text-[#10182d]",
    previewBorderClassName:
      "border-white/80 text-[#10182d] opacity-[0.96]",
    contentClassName: "top-[26%]",
    companyClassName: "text-[#5d6888]",
    dividerClassName: "bg-[#293756]/14",
    titleClassName:
      "font-serif font-normal text-[#10172b] drop-shadow-[0_2px_18px_rgba(255,255,255,.86)]",
    metaClassName: "text-[#303c58]",
    separatorClassName: "text-[#929ab1]",
    locationClassName: "text-[#626d88]",
    insightClassName: "text-[#535f7b]",
    arrowClassName:
      "border-white/80 bg-white/45 text-[#344366] shadow-[0_10px_30px_rgba(67,83,120,.13)] backdrop-blur-lg",
    previewVeilClassName:
      "bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,.68)]",
  },
  {
    id: "ultraviolet-orbit",
    backgroundColor: "#05030d",
    backgroundImage:
      "linear-gradient(92deg, rgb(4 2 13 / .88) 0%, rgb(8 5 26 / .58) 57%, rgb(11 8 38 / .12) 100%), radial-gradient(circle at 82% 23%, rgb(163 113 255 / .34), transparent 30%), linear-gradient(180deg, rgb(2 2 10 / .04), rgb(2 2 10 / .42)), url('/visuals/obsidian-liquid-glass-v1.jpg')",
    backgroundPosition: "center, center, center, 68% 50%",
    backgroundSize: "cover, cover, cover, 122% auto",
    glow:
      "linear-gradient(118deg, transparent 27%, rgb(205 190 255 / .16) 47%, transparent 55%)",
    borderClassName: "border-violet-200/35 text-white",
    previewBorderClassName:
      "border-violet-200/25 text-white opacity-[0.94]",
    contentClassName: "top-[23%]",
    companyClassName: "text-[#ddd4ff]",
    dividerClassName: "bg-violet-100/25",
    titleClassName:
      "font-serif text-white drop-shadow-[0_3px_18px_rgba(0,0,0,.55)]",
    metaClassName: "text-[#f6f3ff]",
    separatorClassName: "text-[#9d8fe1]",
    locationClassName: "text-[#d7d0f5]",
    insightClassName: "text-[#c9c0ed]",
    arrowClassName:
      "border-violet-100/20 bg-violet-100/[0.08] text-white shadow-[0_12px_34px_rgba(2,0,14,.42)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#05030d]/24 shadow-[inset_0_0_0_1px_rgba(225,216,255,.18)]",
  },
  {
    id: "cyan-signal-grid",
    backgroundColor: "#02101d",
    backgroundImage:
      "linear-gradient(90deg, rgb(1 12 23 / .91) 0%, rgb(3 21 37 / .72) 62%, rgb(4 31 48 / .36) 100%), repeating-linear-gradient(90deg, transparent 0 27px, rgb(140 241 255 / .07) 28px 29px), radial-gradient(circle at 78% 18%, rgb(54 222 255 / .25), transparent 34%), url('/visuals/glass-atmosphere-v1.jpg')",
    backgroundPosition: "center, center, center, 60% 50%",
    backgroundSize: "cover, 29px 29px, cover, auto 112%",
    glow:
      "linear-gradient(132deg, transparent 21%, rgb(142 241 255 / .13) 47%, transparent 58%)",
    borderClassName: "border-cyan-100/28 text-white",
    previewBorderClassName:
      "border-cyan-100/20 text-white opacity-[0.94]",
    contentClassName: "top-[17%]",
    contentFrameClassName:
      "rounded-[1.4rem] border border-cyan-100/15 bg-[#031222]/55 p-5 shadow-[0_20px_52px_rgba(0,7,16,.28)] backdrop-blur-[22px]",
    companyClassName: "text-[#a9f3ff]",
    dividerClassName: "bg-cyan-100/20",
    titleClassName:
      "font-sans text-[1.9rem] font-semibold leading-[0.98] text-white drop-shadow-[0_2px_16px_rgba(0,0,0,.5)] sm:text-[2.15rem]",
    metaClassName: "text-[#ecfcff]",
    separatorClassName: "text-[#63bac8]",
    locationClassName: "text-[#b9e6ec]",
    insightClassName: "text-[#a8d5dd]",
    arrowClassName:
      "rounded-[1rem] border-cyan-100/25 bg-cyan-50/[0.09] text-[#dffcff] shadow-[0_10px_30px_rgba(0,8,18,.35)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#02101d]/25 shadow-[inset_0_0_0_1px_rgba(182,247,255,.16)]",
  },
  {
    id: "ruby-prism-night",
    backgroundColor: "#17050d",
    backgroundImage:
      "linear-gradient(93deg, rgb(19 3 10 / .89) 0%, rgb(39 8 20 / .64) 58%, rgb(65 17 34 / .18) 100%), radial-gradient(circle at 83% 24%, rgb(255 68 137 / .25), transparent 30%), linear-gradient(180deg, transparent 35%, rgb(8 1 5 / .46)), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "center, center, center, 72% 45%",
    backgroundSize: "cover, cover, cover, 130% auto",
    glow:
      "linear-gradient(126deg, transparent 20%, rgb(255 181 210 / .14) 44%, transparent 56%)",
    borderClassName: "border-rose-200/32 text-white",
    previewBorderClassName:
      "border-rose-200/23 text-white opacity-[0.94]",
    contentClassName: "top-[18%]",
    contentFrameClassName:
      "rounded-[1.5rem] border border-rose-100/14 bg-[#19060d]/42 p-5 shadow-[0_20px_50px_rgba(15,0,6,.28)] backdrop-blur-xl",
    companyClassName: "text-[#ffc9dc]",
    dividerClassName: "bg-rose-100/22",
    titleClassName:
      "font-serif text-[1.9rem] leading-[0.98] text-[#fff8fb] drop-shadow-[0_3px_18px_rgba(15,0,7,.56)] sm:text-[2.18rem]",
    metaClassName: "text-[#fff3f7]",
    separatorClassName: "text-[#d77f9d]",
    locationClassName: "text-[#f1c1d1]",
    insightClassName: "text-[#e3afc0]",
    arrowClassName:
      "border-rose-100/22 bg-rose-50/[0.09] text-[#fff4f8] shadow-[0_12px_32px_rgba(20,0,8,.38)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#16050c]/24 shadow-[inset_0_0_0_1px_rgba(255,211,226,.17)]",
  },
  {
    id: "emerald-terminal",
    backgroundColor: "#010907",
    backgroundImage:
      "linear-gradient(90deg, rgb(0 8 6 / .91) 0%, rgb(0 16 11 / .67) 61%, rgb(2 30 18 / .15) 100%), repeating-linear-gradient(0deg, transparent 0 35px, rgb(168 255 212 / .055) 36px 37px), radial-gradient(circle at 80% 70%, rgb(62 255 155 / .18), transparent 34%), url('/visuals/card-emerald-smoke-v1.jpg')",
    backgroundPosition: "center, center, center, 66% 52%",
    backgroundSize: "cover, 37px 37px, cover, 118% auto",
    glow:
      "linear-gradient(121deg, transparent 23%, rgb(158 255 207 / .11) 46%, transparent 57%)",
    borderClassName: "border-emerald-200/30 text-white",
    previewBorderClassName:
      "border-emerald-200/22 text-white opacity-[0.94]",
    contentClassName: "top-[22%]",
    contentFrameClassName: "border-l border-emerald-100/35 pl-5",
    companyClassName: "font-mono text-[#9df5c7]",
    dividerClassName: "bg-emerald-100/22",
    titleClassName:
      "font-sans font-semibold text-white drop-shadow-[0_2px_16px_rgba(0,0,0,.52)]",
    metaClassName: "text-[#ecfff5]",
    separatorClassName: "text-[#5ba87e]",
    locationClassName: "text-[#b8ddc9]",
    insightClassName: "text-[#a5d2ba]",
    arrowClassName:
      "rounded-[0.95rem] border-emerald-100/22 bg-emerald-50/[0.08] text-[#dcffec] shadow-[0_10px_30px_rgba(0,8,4,.4)] backdrop-blur-lg",
    previewVeilClassName:
      "bg-[#010906]/25 shadow-[inset_0_0_0_1px_rgba(194,255,223,.14)]",
  },
  {
    id: "polar-hologram",
    backgroundColor: "#eef3ff",
    backgroundImage:
      "linear-gradient(92deg, rgb(247 250 255 / .72) 0%, rgb(241 246 255 / .52) 62%, rgb(235 244 255 / .17) 100%), radial-gradient(circle at 80% 20%, rgb(143 122 255 / .22), transparent 31%), radial-gradient(circle at 19% 81%, rgb(47 216 255 / .16), transparent 35%), url('/visuals/glass-atmosphere-v1.jpg')",
    backgroundPosition: "center, center, center, 48% 50%",
    backgroundSize: "cover, cover, cover, auto 112%",
    glow:
      "linear-gradient(127deg, transparent 17%, rgb(255 255 255 / .48) 45%, transparent 58%)",
    borderClassName: "border-white/85 text-[#10182c]",
    previewBorderClassName:
      "border-white/75 text-[#10182c] opacity-[0.95]",
    contentClassName: "top-[18%]",
    contentFrameClassName:
      "rounded-[1.5rem] border border-white/65 bg-white/38 p-5 shadow-[0_20px_52px_rgba(50,77,130,.14)] backdrop-blur-[20px]",
    companyClassName: "text-[#5b4f9d]",
    dividerClassName: "bg-[#30456e]/18",
    titleClassName:
      "font-sans text-[1.9rem] font-semibold leading-[0.98] text-[#10182c] drop-shadow-[0_2px_18px_rgba(255,255,255,.9)] sm:text-[2.15rem]",
    metaClassName: "text-[#152643]",
    separatorClassName: "text-[#7d8ba8]",
    locationClassName: "text-[#486080]",
    insightClassName: "text-[#3d5274]",
    arrowClassName:
      "border-white/80 bg-white/48 text-[#243b65] shadow-[0_12px_34px_rgba(50,77,130,.15)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-white/[0.08] shadow-[inset_0_0_0_1px_rgba(255,255,255,.62)]",
  },
  {
    id: "titanium-lens",
    backgroundColor: "#07111c",
    backgroundImage:
      "linear-gradient(91deg, rgb(4 12 22 / .89) 0%, rgb(8 24 39 / .68) 59%, rgb(16 47 70 / .12) 100%), radial-gradient(circle at 83% 48%, rgb(155 224 255 / .18), transparent 32%), linear-gradient(180deg, rgb(3 10 18 / .03), rgb(3 10 18 / .42)), url('/visuals/card-silver-ice-v1.jpg')",
    backgroundPosition: "center, center, center, 76% 50%",
    backgroundSize: "cover, cover, cover, 128% auto",
    glow:
      "linear-gradient(134deg, transparent 24%, rgb(211 242 255 / .15) 47%, transparent 59%)",
    borderClassName: "border-sky-100/30 text-white",
    previewBorderClassName:
      "border-sky-100/22 text-white opacity-[0.94]",
    contentClassName: "top-[27%]",
    companyClassName: "text-[#c7ebff]",
    dividerClassName: "bg-sky-100/24",
    titleClassName:
      "font-serif text-white drop-shadow-[0_3px_18px_rgba(0,5,12,.55)]",
    metaClassName: "text-[#f0faff]",
    separatorClassName: "text-[#78a7bf]",
    locationClassName: "text-[#c2dfed]",
    insightClassName: "text-[#afd0e0]",
    arrowClassName:
      "border-sky-100/22 bg-sky-50/[0.08] text-[#e5f7ff] shadow-[0_10px_30px_rgba(0,8,18,.38)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#06111c]/22 shadow-[inset_0_0_0_1px_rgba(211,242,255,.16)]",
  },
  {
    id: "copper-eclipse",
    backgroundColor: "#1c100c",
    backgroundImage:
      "linear-gradient(91deg, rgb(25 12 8 / .87) 0%, rgb(50 26 17 / .62) 60%, rgb(90 48 31 / .12) 100%), radial-gradient(circle at 79% 72%, rgb(255 147 85 / .24), transparent 33%), linear-gradient(180deg, rgb(18 7 4 / .05), rgb(16 7 4 / .43)), url('/visuals/card-champagne-prism-v1.jpg')",
    backgroundPosition: "center, center, center, 38% 63%",
    backgroundSize: "cover, cover, cover, 124% auto",
    glow:
      "linear-gradient(119deg, transparent 20%, rgb(255 207 173 / .14) 45%, transparent 57%)",
    borderClassName: "border-orange-100/32 text-white",
    previewBorderClassName:
      "border-orange-100/23 text-white opacity-[0.94]",
    contentClassName: "top-[18%]",
    contentFrameClassName:
      "rounded-[1.35rem] border border-orange-100/13 bg-[#1d0d08]/38 p-5 shadow-[0_18px_46px_rgba(16,6,2,.27)] backdrop-blur-xl",
    companyClassName: "text-[#ffd4b7]",
    dividerClassName: "bg-orange-100/22",
    titleClassName:
      "font-serif text-[1.9rem] leading-[0.98] text-[#fffaf6] drop-shadow-[0_3px_18px_rgba(17,5,1,.55)] sm:text-[2.18rem]",
    metaClassName: "text-[#fff4eb]",
    separatorClassName: "text-[#c48762]",
    locationClassName: "text-[#edc6ae]",
    insightClassName: "text-[#ddb49b]",
    arrowClassName:
      "border-orange-100/22 bg-orange-50/[0.08] text-[#fff3e9] shadow-[0_10px_30px_rgba(18,7,2,.36)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#1b0e0a]/23 shadow-[inset_0_0_0_1px_rgba(255,222,198,.16)]",
  },
  {
    id: "midnight-axis",
    backgroundColor: "#01040a",
    backgroundImage:
      "linear-gradient(90deg, rgb(0 3 9 / .93) 0%, rgb(2 8 18 / .72) 62%, rgb(5 16 34 / .22) 100%), repeating-linear-gradient(90deg, transparent 0 47px, rgb(130 183 255 / .06) 48px 49px), radial-gradient(ellipse at 88% 50%, rgb(58 119 255 / .27), transparent 31%), url('/visuals/obsidian-liquid-glass-v1.jpg')",
    backgroundPosition: "center, center, center, 83% 50%",
    backgroundSize: "cover, 49px 49px, cover, 136% auto",
    glow:
      "linear-gradient(115deg, transparent 29%, rgb(175 207 255 / .13) 47%, transparent 55%)",
    borderClassName: "border-blue-100/27 text-white",
    previewBorderClassName:
      "border-blue-100/20 text-white opacity-[0.94]",
    contentClassName: "top-[19%]",
    contentFrameClassName: "border-l-2 border-blue-200/30 pl-5",
    companyClassName: "text-[#adcaff]",
    dividerClassName: "bg-blue-100/20",
    titleClassName:
      "font-sans font-medium text-white drop-shadow-[0_3px_17px_rgba(0,0,0,.58)]",
    metaClassName: "text-[#f0f5ff]",
    separatorClassName: "text-[#6683b5]",
    locationClassName: "text-[#b5c5e3]",
    insightClassName: "text-[#a6b8d8]",
    arrowClassName:
      "rounded-[0.95rem] border-blue-100/20 bg-blue-50/[0.07] text-[#e6efff] shadow-[0_10px_32px_rgba(0,3,12,.42)] backdrop-blur-xl",
    previewVeilClassName:
      "bg-[#01040a]/25 shadow-[inset_0_0_0_1px_rgba(194,215,255,.14)]",
  },
] as const satisfies readonly JobCardTemplate[];

export const JOB_CARD_TEMPLATE_COUNT = JOB_CARD_TEMPLATES.length;

function normalizedCompanyName(company: string) {
  return company.trim().normalize("NFKC").toLocaleLowerCase("en-US");
}

function affinityScore(companyKey: string, templateId: string) {
  const input = companyKey + "\0" + templateId;
  let hash = 2_166_136_261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x846ca68b);
  hash ^= hash >>> 16;

  return hash >>> 0;
}

export function jobCardTemplateForCompany(company: string): JobCardTemplate {
  const companyKey = normalizedCompanyName(company) || "unknown-company";
  let selected: JobCardTemplate = JOB_CARD_TEMPLATES[0];
  let selectedScore = affinityScore(companyKey, selected.id);

  for (let index = 1; index < JOB_CARD_TEMPLATES.length; index += 1) {
    const candidate = JOB_CARD_TEMPLATES[index];
    const score = affinityScore(companyKey, candidate.id);

    if (
      score > selectedScore ||
      (score === selectedScore && candidate.id < selected.id)
    ) {
      selected = candidate;
      selectedScore = score;
    }
  }

  return selected;
}
