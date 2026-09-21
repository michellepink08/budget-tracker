import {expect,test,type Locator} from "@playwright/test";

const fontSize=(locator:Locator)=>locator.evaluate((element)=>getComputedStyle(element).fontSize);

test("uses compact mobile and desktop type scales with denser tables",async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await page.goto("/dashboard");
 await expect(page.getByRole("heading",{name:"Your money, at a glance"})).toBeVisible();
 expect(await fontSize(page.getByRole("heading",{name:"Your money, at a glance"}))).toBe("18px");
 expect(await fontSize(page.getByText("Disposable Accounts",{exact:true}))).toBe("12px");
 expect(await fontSize(page.locator(".dashboard-balance.text-2xl").first())).toBe("21px");
 expect(await fontSize(page.getByText("Separate from everyday funds. Transfers and emergency withdrawals remain available.",{exact:true}))).toBe("11px");

 await page.goto("/budget");
 expect(await fontSize(page.getByRole("spinbutton",{name:/Planned budget for/}).first())).toBe("16px");
 const mobileTable=page.locator(".workspace-main table").first();
 expect(await fontSize(mobileTable)).toBe("12px");
 expect(await mobileTable.locator("th").first().evaluate((element)=>getComputedStyle(element).paddingTop)).toBe("8px");

 await page.setViewportSize({width:1280,height:900});
 await page.goto("/dashboard");
 expect(await fontSize(page.getByRole("heading",{name:"Your money, at a glance"}))).toBe("22px");
 expect(await fontSize(page.getByText("Disposable Accounts",{exact:true}))).toBe("13px");
 expect(await fontSize(page.locator(".dashboard-balance.text-2xl").first())).toBe("26px");
 await page.goto("/budget");
 const desktopTable=page.locator(".workspace-main table").first();
 expect(await fontSize(desktopTable)).toBe("13px");
 expect(await desktopTable.locator("th").first().evaluate((element)=>getComputedStyle(element).paddingTop)).toBe("10px");
});
