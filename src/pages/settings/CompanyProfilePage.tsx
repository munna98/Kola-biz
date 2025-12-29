import { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState, setCompanyProfile, updateCompanyField, setCompanyLoading } from '../../store';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { IconBuilding, IconFileText, IconCreditCard, IconPhoto } from '@tabler/icons-react';


export default function CompanyProfilePage() {
    const dispatch = useDispatch();
    const { profile, loading } = useSelector((state: RootState) => state.companyProfile);
    const [logoPreview, setLogoPreview] = useState<string>('');

    useEffect(() => {
        loadCompanyProfile();
    }, []);

    useEffect(() => {
        if (profile.logo_data) {
            setLogoPreview(profile.logo_data);
        }
    }, [profile.logo_data]);

    const loadCompanyProfile = async () => {
        try {
            dispatch(setCompanyLoading(true));
            const data = await invoke<typeof profile>('get_company_profile');
            dispatch(setCompanyProfile(data));
        } catch (error) {
            toast.error('Failed to load company profile: ' + error);
        } finally {
            dispatch(setCompanyLoading(false));
        }
    };

    const handleInputChange = (field: keyof typeof profile, value: string) => {
        dispatch(updateCompanyField({ field, value }));
    };

    const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Check file size (limit to 1MB)
            if (file.size > 1024 * 1024) {
                toast.error('Logo file size must be less than 1MB');
                return;
            }

            // Check file type
            if (!file.type.startsWith('image/')) {
                toast.error('Please select an image file');
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                const base64String = reader.result as string;
                handleInputChange('logo_data', base64String);
                setLogoPreview(base64String);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleClearLogo = () => {
        handleInputChange('logo_data', '');
        setLogoPreview('');
    };

    const handleSave = async () => {
        try {
            dispatch(setCompanyLoading(true));
            const updatedProfile = await invoke<typeof profile>('update_company_profile', { profile });
            dispatch(setCompanyProfile(updatedProfile));
            toast.success('Company profile updated successfully');
        } catch (error) {
            toast.error('Failed to update company profile: ' + error);
        } finally {
            dispatch(setCompanyLoading(false));
        }
    };

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <div className="mb-6">
                <h1 className="text-3xl font-bold">Company Profile Settings</h1>
                <p className="text-muted-foreground mt-1">
                    Configure your company information, legal details, and business settings
                </p>
            </div>

            <Tabs defaultValue="company" className="space-y-4">
                <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="company">
                        <IconBuilding size={16} className="mr-2" />
                        Company Info
                    </TabsTrigger>
                    <TabsTrigger value="legal">
                        <IconFileText size={16} className="mr-2" />
                        Legal Details
                    </TabsTrigger>
                    <TabsTrigger value="bank">
                        <IconCreditCard size={16} className="mr-2" />
                        Bank Details
                    </TabsTrigger>
                    <TabsTrigger value="branding">
                        <IconPhoto size={16} className="mr-2" />
                        Branding
                    </TabsTrigger>
                </TabsList>

                {/* Company Information Tab */}
                <TabsContent value="company" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Company Information</CardTitle>
                            <CardDescription>
                                Basic information about your company
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="company_name">Company Name *</Label>
                                    <Input
                                        id="company_name"
                                        value={profile.company_name}
                                        onChange={(e) => handleInputChange('company_name', e.target.value)}
                                        placeholder="Enter company name"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="business_type">Business Type</Label>
                                    <Input
                                        id="business_type"
                                        value={profile.business_type}
                                        onChange={(e) => handleInputChange('business_type', e.target.value)}
                                        placeholder="e.g., Retail, Manufacturing"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="address_line1">Address Line 1</Label>
                                    <Input
                                        id="address_line1"
                                        value={profile.address_line1}
                                        onChange={(e) => handleInputChange('address_line1', e.target.value)}
                                        placeholder="Street address"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address_line2">Address Line 2</Label>
                                    <Input
                                        id="address_line2"
                                        value={profile.address_line2}
                                        onChange={(e) => handleInputChange('address_line2', e.target.value)}
                                        placeholder="Apartment, suite, etc."
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="address_line3">Address Line 3</Label>
                                    <Input
                                        id="address_line3"
                                        value={profile.address_line3}
                                        onChange={(e) => handleInputChange('address_line3', e.target.value)}
                                        placeholder="Additional address info"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="city">City</Label>
                                    <Input
                                        id="city"
                                        value={profile.city}
                                        onChange={(e) => handleInputChange('city', e.target.value)}
                                        placeholder="City"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="state">State</Label>
                                    <Input
                                        id="state"
                                        value={profile.state}
                                        onChange={(e) => handleInputChange('state', e.target.value)}
                                        placeholder="State"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pincode">Pincode</Label>
                                    <Input
                                        id="pincode"
                                        value={profile.pincode}
                                        onChange={(e) => handleInputChange('pincode', e.target.value)}
                                        placeholder="Pincode"
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="country">Country</Label>
                                <Input
                                    id="country"
                                    value={profile.country}
                                    onChange={(e) => handleInputChange('country', e.target.value)}
                                    placeholder="Country"
                                />
                            </div>

                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="phone">Phone</Label>
                                    <Input
                                        id="phone"
                                        value={profile.phone}
                                        onChange={(e) => handleInputChange('phone', e.target.value)}
                                        placeholder="Phone number"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="email">Email</Label>
                                    <Input
                                        id="email"
                                        type="email"
                                        value={profile.email}
                                        onChange={(e) => handleInputChange('email', e.target.value)}
                                        placeholder="Email address"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="website">Website</Label>
                                    <Input
                                        id="website"
                                        value={profile.website}
                                        onChange={(e) => handleInputChange('website', e.target.value)}
                                        placeholder="www.example.com"
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Legal Details Tab */}
                <TabsContent value="legal" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Legal Information</CardTitle>
                            <CardDescription>
                                Tax and legal identification numbers
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-3 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="gstin">GSTIN</Label>
                                    <Input
                                        id="gstin"
                                        value={profile.gstin}
                                        onChange={(e) => handleInputChange('gstin', e.target.value.toUpperCase())}
                                        placeholder="GST Identification Number"
                                        maxLength={15}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="pan">PAN</Label>
                                    <Input
                                        id="pan"
                                        value={profile.pan}
                                        onChange={(e) => handleInputChange('pan', e.target.value.toUpperCase())}
                                        placeholder="PAN Number"
                                        maxLength={10}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cin">CIN</Label>
                                    <Input
                                        id="cin"
                                        value={profile.cin}
                                        onChange={(e) => handleInputChange('cin', e.target.value.toUpperCase())}
                                        placeholder="Corporate Identification Number"
                                        maxLength={21}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="terms_and_conditions">Terms & Conditions</Label>
                                <Textarea
                                    id="terms_and_conditions"
                                    value={profile.terms_and_conditions}
                                    onChange={(e) => handleInputChange('terms_and_conditions', e.target.value)}
                                    placeholder="Enter your standard terms and conditions for invoices and documents"
                                    rows={8}
                                    className="resize-none"
                                />
                                <p className="text-xs text-muted-foreground">
                                    These terms will appear on your invoices and other documents
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Bank Details Tab */}
                <TabsContent value="bank" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Bank Account Details</CardTitle>
                            <CardDescription>
                                Primary bank account information for transactions
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="bank_name">Bank Name</Label>
                                    <Input
                                        id="bank_name"
                                        value={profile.bank_name}
                                        onChange={(e) => handleInputChange('bank_name', e.target.value)}
                                        placeholder="Name of the bank"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank_branch">Branch</Label>
                                    <Input
                                        id="bank_branch"
                                        value={profile.bank_branch}
                                        onChange={(e) => handleInputChange('bank_branch', e.target.value)}
                                        placeholder="Branch name/location"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="bank_account_no">Account Number</Label>
                                    <Input
                                        id="bank_account_no"
                                        value={profile.bank_account_no}
                                        onChange={(e) => handleInputChange('bank_account_no', e.target.value)}
                                        placeholder="Bank account number"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="bank_ifsc">IFSC Code</Label>
                                    <Input
                                        id="bank_ifsc"
                                        value={profile.bank_ifsc}
                                        onChange={(e) => handleInputChange('bank_ifsc', e.target.value.toUpperCase())}
                                        placeholder="IFSC Code"
                                        maxLength={11}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Branding Tab */}
                <TabsContent value="branding" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Company Logo</CardTitle>
                            <CardDescription>
                                Upload your company logo for invoices and documents
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-4">
                                {logoPreview && (
                                    <div className="flex items-center gap-4">
                                        <div className="border rounded-md p-4 bg-muted">
                                            <img
                                                src={logoPreview}
                                                alt="Company Logo"
                                                className="max-w-xs max-h-32 object-contain"
                                            />
                                        </div>
                                        <Button
                                            variant="outline"
                                            onClick={handleClearLogo}
                                            size="sm"
                                        >
                                            Clear Logo
                                        </Button>
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <Label htmlFor="logo_upload">Upload Logo</Label>
                                    <Input
                                        id="logo_upload"
                                        type="file"
                                        accept="image/*"
                                        onChange={handleLogoUpload}
                                        className="cursor-pointer"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Recommended: PNG or JPG, max 1MB. Logo will be stored in the database.
                                    </p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

            </Tabs>

            {/* Save Button */}
            <div className="flex justify-end mt-6">
                <Button
                    onClick={handleSave}
                    disabled={loading || !profile.company_name}
                    size="lg"
                >
                    {loading ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>
        </div>
    );
}
