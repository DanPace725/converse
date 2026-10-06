Cloud Assist preview
Gemini can make mistakes. Double check responses, and use code with caution .

How do I create a Web application OAuth client?

To create a Web application OAuth client ID in Google Cloud, follow these step-by-step instructions:

Step 1: Configure the OAuth Consent Screen (If not already done)
If this is the first time you are setting up OAuth credentials in your Google Cloud project, you must configure the OAuth consent screen first:

In the Google Cloud console, go to the Navigation menu (☰) and select APIs & Services > OAuth consent screen .
Choose a User Type (typically External for public applications or Internal if you are within a Google Workspace organization) and click Create.
Fill in the required fields:
App name: The name of the application that users see when consenting.
User support email: An email address for users to contact you with consent questions.
Developer contact information: Email addresses Google can use to notify you of changes.
Click Save and Continue through the Scopes, Test Users, and Summary screens, then click Back to Dashboard.
Step 2: Create the OAuth Web Client ID
Once your consent screen is ready, you can generate the credentials:

In the left-hand navigation pane, click Credentials .
Click Create Credentials at the top of the page, and select OAuth client ID from the dropdown.
In the Application type dropdown field, select Web application.
In the Name field, enter a descriptive name for your client ID (this name is only visible to you in the console).
Step 3: Configure Authorization URIs
Depending on how your web app behaves, configure the following endpoints:

Authorized JavaScript origins: Under this section, click Add URI and enter the exact domain scheme and fully qualified hostname where your app runs (e.g., https://www.example.com). For local development, you can add both http://localhost and http://localhost:<port_number>.
Authorized redirect URIs: Under this section, click Add URI and enter the absolute URL where Google should send authentication responses (e.g., https://www.example.com/auth-receiver or https://www.example.com/oauth2/callback).
Step 4: Retrieve and Save Your Client Credentials
Click Create at the bottom of the page.
A dialog box will appear displaying your newly generated Client ID (e.g., 1234567890-abc123def456.apps.googleusercontent.com) and Client Secret.
Copy both values immediately and store them securely in your application’s environment configuration or secrets manager.
References
For detailed documentation on setting up client IDs, refer to the Google Identity Services Client ID Guide .
Would you like assistance in generating a Terraform template to automate the creation of these credentials or integrating them with your backend code?

Enter a prompt

