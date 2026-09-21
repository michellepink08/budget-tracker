import {test,expect} from "@playwright/test";
test("Grocery is directly accessible with its existing tabs and list form",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/login");await page.getByLabel("Email").fill("demo@example.com");await page.getByLabel("Password").fill("demopassword123");await page.getByRole("button",{name:"Log in"}).click();await page.waitForURL("**/dashboard");
 const grocery=page.locator("aside").getByRole("link",{name:"Grocery",exact:true});await expect(grocery).toBeVisible();await grocery.click();await page.waitForURL("**/shopping");
 await expect(page.getByRole("heading",{name:"Grocery",exact:true})).toBeVisible();
 for(const tab of ["current","saved","catalog","history","scan"]){const response=await page.goto(`/shopping?tab=${tab}`);expect(response?.status()).toBe(200);await expect(page.getByRole("heading",{name:"Grocery",exact:true})).toBeVisible();await expect(page.locator("main")).not.toContainText("Something went wrong");}
 await page.goto("/shopping?tab=saved");await page.getByRole("button",{name:"New list",exact:true}).click();await expect(page.getByRole("dialog",{name:"New grocery list"})).toBeVisible();await page.keyboard.press("Escape");
 await page.setViewportSize({width:360,height:480});await page.getByRole("button",{name:"Open navigation"}).click();const drawer=page.getByRole("dialog",{name:"Budget Tracker navigation"});await expect(drawer.getByRole("link",{name:"Grocery",exact:true})).toBeVisible();await drawer.getByRole("link",{name:"Grocery",exact:true}).click();await page.waitForURL("**/shopping");await expect(drawer).not.toBeVisible();expect(errors).toEqual([]);
});
test("sidebar stays in the viewport while only overflowing navigation scrolls",async({page})=>{
 await page.goto("/login");await page.getByLabel("Email").fill("demo@example.com");await page.getByLabel("Password").fill("demopassword123");await page.getByRole("button",{name:"Log in"}).click();await page.waitForURL("**/dashboard");
 await page.goto("/budget");
 const sidebar=page.locator("aside").first();
 for(const height of [1440,900,360]){
  await page.setViewportSize({width:1440,height});await page.evaluate(()=>window.scrollTo(0,0));
  await sidebar.locator("details").evaluate(details=>{(details as HTMLDetailsElement).open=true;});
  const before=await sidebar.boundingBox();expect(before!.height).toBe(height);expect(before!.y).toBe(0);
  await page.evaluate(()=>window.scrollTo(0,600));expect(await page.evaluate(()=>window.scrollY)).toBeGreaterThan(100);
  const after=await sidebar.boundingBox();expect(after!.y).toBe(0);expect(after!.height).toBe(height);
  const signOut=sidebar.getByRole("button",{name:"Sign out",exact:true});await expect(signOut).toBeInViewport();
  const footer=signOut.locator("xpath=../..");const footerBox=await footer.boundingBox();expect(footerBox!.y+footerBox!.height).toBeCloseTo(height,0);
  await expect(sidebar.getByRole("button",{name:"Add",exact:true})).toBeInViewport();
  const nav=sidebar.locator("nav");
  if(height===360){
   expect(await nav.evaluate(nav=>nav.scrollHeight>nav.clientHeight)).toBe(true);
   await nav.evaluate(nav=>{nav.scrollTop=nav.scrollHeight;});expect(await nav.evaluate(nav=>nav.scrollTop)).toBeGreaterThan(0);
   await expect(signOut).toBeInViewport();expect((await sidebar.boundingBox())!.y).toBe(0);
  }
 }
 await page.setViewportSize({width:360,height:480});await page.evaluate(()=>window.scrollTo(0,0));
 await page.getByRole("button",{name:"Open navigation"}).click();const drawer=page.getByRole("dialog",{name:"Budget Tracker navigation"});await expect(drawer).toBeVisible();
 await drawer.locator("details").evaluate(details=>{(details as HTMLDetailsElement).open=true;});
 const signOut=drawer.getByRole("button",{name:"Sign out",exact:true});await expect(signOut).toBeInViewport();
 const footer=signOut.locator("xpath=../..");const box=await footer.boundingBox();expect(box!.y+box!.height).toBeGreaterThan(440);expect(box!.y+box!.height).toBeLessThanOrEqual(480);
 await drawer.locator("nav").evaluate(nav=>{nav.scrollTop=nav.scrollHeight;});await expect(signOut).toBeInViewport();
 await page.keyboard.press("Escape");
});
test("approved workspace navigation and planning remain usable without financial writes",async({page})=>{
 const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto("/login");await page.getByLabel("Email").fill("demo@example.com");await page.getByLabel("Password").fill("demopassword123");await page.getByRole("button",{name:"Log in"}).click();await page.waitForURL("**/dashboard");
 const breakdown=page.locator("details[data-account-breakdown]").first();await expect(breakdown).toBeVisible();await expect(breakdown).not.toHaveAttribute("open","");await breakdown.locator("summary").click();await expect(breakdown).toHaveAttribute("open","");
 for(const width of [2560,3440]){
  await page.setViewportSize({width,height:1440});await page.goto("/transactions");
  const dimensions=await page.locator("main").evaluate(main=>({width:main.getBoundingClientRect().width,available:main.parentElement!.getBoundingClientRect().width}));
  expect(dimensions.width,`Transactions should fill the available workspace at ${width}px`).toBeGreaterThan(dimensions.available-2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  const table=page.locator(".workspace-account-table");await expect(table).toBeVisible();
  expect(await table.evaluate(table=>table.parentElement!.scrollWidth<=table.parentElement!.clientWidth+1)).toBe(true);
 }
 await page.setViewportSize({width:1280,height:900});
 await page.goto("/transactions");await expect(page.getByRole("button",{name:"Account columns",exact:true})).toHaveAttribute("aria-pressed","true");await page.getByRole("button",{name:"List view",exact:true}).click();await expect(page.getByRole("button",{name:"List view",exact:true})).toHaveAttribute("aria-pressed","true");
 await page.goto("/budget");const output=page.getByTestId("remaining-to-budget");await expect(output).toBeVisible();const before=await output.textContent();const input=page.getByRole("spinbutton",{name:/Planned budget for/}).first();await input.fill("9876.54");await expect(output).not.toHaveText(before!);await expect(page.getByText("Includes unsaved edits",{exact:true})).toBeVisible();
 for(const path of ["/loans-cards","/accounts?section=savings","/tierra-alta","/lending","/calendar","/year-plan"]){const r=await page.goto(path);expect(r?.status(),path).toBe(200);await expect(page.locator("main")).not.toContainText("Something went wrong");}
 await page.goto("/loans-cards");await page.getByRole("button",{name:"Add credit card",exact:true}).click();const cardDialog=page.getByRole("dialog",{name:"Add credit card"});await expect(cardDialog.getByLabel("Monthly interest estimate (%)")).toHaveValue("3");await cardDialog.getByLabel("Monthly interest estimate (%)").fill("2.5");await expect(cardDialog.getByLabel("Interest rate (annual %)")).toHaveValue("0");await page.keyboard.press("Escape");await page.goto("/year-plan");
 await expect(page.getByRole("navigation",{name:"Plan sections"})).toBeVisible();
 await page.screenshot({path:"C:/Users/Michelle Pink Rejuso/.codex/visualizations/2026/09/15/01a0a48b-38b1-7c11-92d7-d25776495544/phase-two-desktop.png",fullPage:true});
 await page.setViewportSize({width:360,height:900});await page.goto("/transactions");expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await page.getByRole("button",{name:"Open navigation"}).click();const drawer=page.getByRole("dialog",{name:"Budget Tracker navigation"});await expect(drawer).toBeVisible();await expect(drawer.getByRole("link",{name:"Trackers",exact:true})).toBeVisible();await expect(drawer.getByRole("button",{name:/Sign out/i})).toBeVisible();await page.keyboard.press("Escape");
 await page.evaluate(()=>document.documentElement.classList.add("dark"));await expect(page.locator("main")).toBeVisible();expect(errors).toEqual([]);
 await page.screenshot({path:"C:/Users/Michelle Pink Rejuso/.codex/visualizations/2026/09/15/01a0a48b-38b1-7c11-92d7-d25776495544/phase-two-mobile-dark.png",fullPage:true});
});
