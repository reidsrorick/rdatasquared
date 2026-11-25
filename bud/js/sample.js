/* sample.js: made-up data for "Start with sample data" and ?demo.
   Nothing here is real; it lets you look around without connecting a folder. Exposed on window.BB.sample */
(function () {
  "use strict";
  window.BB = window.BB || {};

  function build() {
    const now = new Date();
    const day = (monthsBack, d) => new Date(now.getFullYear(), now.getMonth() - monthsBack, d);

    // the people in this made-up budget
    const people = [
      { Name: "Riley", Kind: "Roommate" },
      { Name: "Casey", Kind: "Friend" },
      { Name: "Jordan", Kind: "Family" },
      { Name: "Employer", Kind: "Employer" },
      { Name: "Northwind Ltd", Kind: "Client" },
    ];

    // each bill says who it is split with and how (a bill with none is just yours)
    const subscriptions = [
      { Item: "Rent", Amount: 1900, Occurance: "Monthly", Category: "Bill", Active: true, Description: "You pay $100 more than half",
        "Split With": "Riley", "Split Method": "Equal, but I pay more or less", "Split Values": "100" },
      { Item: "Electric", Amount: 90, Occurance: "Monthly", Category: "Bill", Active: true,
        "Split With": "Riley", "Split Method": "Split equally" },
      { Item: "Water", Amount: 48.2, Occurance: "Monthly", Category: "Bill", Active: true,
        "Split With": "Riley", "Split Method": "Split equally" },
      { Item: "Internet", Amount: 64.99, Occurance: "Monthly", Category: "Bill", Active: true,
        "Split With": "Riley", "Split Method": "Split equally" },
      { Item: "Renters insurance", Amount: 14, Occurance: "Monthly", Category: "Bill", Active: true },
      { Item: "Streaming", Description: "Family plan", Amount: 15.49, Occurance: "Monthly", Category: "Subscription", Active: true,
        "Split With": "Riley; Casey", "Split Method": "Split equally", "Start Date": day(14, 3) },
      { Item: "Music", Amount: 11.99, Occurance: "Monthly", Category: "Subscription", Active: true, "Start Date": day(20, 9) },
      { Item: "Cloud storage", Amount: 35.88, Occurance: "Yearly", Category: "Subscription", Active: true },
      { Item: "Phone", Description: "Unlimited plan", Amount: 62, Occurance: "Monthly", Category: "Bill", Active: true },
      { Item: "Car insurance", Amount: 138.5, Occurance: "Monthly", Category: "Bill", Active: true, Comments: "Autopay on the 15th" },
      { Item: "Gym", Amount: 32, Occurance: "Monthly", Category: "Subscription", Active: false, "End Date": day(2, 28) },
    ];

    // four months of payments, logged against those bills
    const apartment = [];
    for (let m = 3; m >= 0; m--) {
      apartment.push({ Date: day(m, 1), Item: "Rent", "Total Amount": 1900 });
      apartment.push({ Date: day(m, 6), Item: "Electric", "Total Amount": [96.4, 84.15, 71.8, 102.37][3 - m] });
      apartment.push({ Date: day(m, 8), Item: "Water", "Total Amount": 48.2 });
      apartment.push({ Date: day(m, 12), Item: "Internet", "Total Amount": 64.99 });
      apartment.push({ Date: day(m, 14), Item: "Streaming", "Total Amount": 15.49 });
      if (m === 3) apartment.push({ Date: day(m, 3), Item: "Renters insurance", "Total Amount": 14 });
    }

    // payment requests: older months settled, last month still out
    const requests = [3, 2, 1].map((m, i) => ({
      Title: `${day(m, 1).toLocaleDateString("en-US", { month: "long" })} ${day(m, 1).getFullYear()} Bills`,
      Month: day(m, 1),
      Person: "Riley",
      Description: "Payment request for apartment bills",
      Status: i < 2 ? "Complete" : "Awaiting Transfer",
      "Request Sent?": day(m - 1, 2),
      "Payment Received?": i < 2 ? day(m - 1, 4) : null,
      "Account Transferred?": i < 2 ? day(m - 1, 6) : null,
    }));

    // things fronted for other people; a few belong to a trip
    const trip = "Austin client trip";
    const expenses = [
      { "Date of Original Purchase": day(0, 3), Activity: "Flight to Austin", Description: "Round trip", Amount: 412.6, "Owed By": "Northwind Ltd", Purpose: "Kickoff onsite", Group: trip, Status: "Pending" },
      { "Date of Original Purchase": day(0, 3), Activity: "Hotel, 2 nights", Amount: 389.2, "Owed By": "Northwind Ltd", Purpose: "Kickoff onsite", Group: trip, Status: "Pending" },
      { "Date of Original Purchase": day(0, 4), Activity: "Rideshare", Amount: 46.75, "Owed By": "Northwind Ltd", Purpose: "Kickoff onsite", Group: trip, Status: "Submitted", "Date Submitted": day(0, 5) },
      { "Date of Original Purchase": day(1, 20), Activity: "Conference ticket", Amount: 249, "Owed By": "Employer", Purpose: "Learning budget", Status: "Submitted", "Date Submitted": day(1, 22) },
      { "Date of Original Purchase": day(2, 9), Activity: "Concert tickets", Description: "Two seats", Amount: 168, "Owed By": "Casey", Status: "Paid", "Date Submitted": day(2, 10), "Date Paid": day(2, 14) },
      { "Date of Original Purchase": day(0, 1), Activity: "Groceries for the cabin weekend", Amount: 94.3, "Owed By": "Jordan", Status: "Pending" },
    ];

    return {
      settings: { setupDone: true, me: "Alex" },
      rowsBySchema: { apartment, requests, subscriptions, thirdparty: expenses, people },
      links: [
        { Place: "Electric company", Link: "https://example.com/electric", Purpose: "Pay the power bill" },
        { Place: "Water & trash", Link: "https://example.com/water", Purpose: "City utilities portal" },
        { Place: "Internet", Link: "https://example.com/internet", Purpose: "Account and billing" },
      ],
      migrations: { settledBeforeFirstRequest: true, peopleModel: true },
      groups: [trip],
    };
  }

  window.BB.sample = { build };
})();
